import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { globSync } from "glob";
import { CONFIG_DIR_NAME } from "../../../config.js";

export type SemanticWorkspaceStateKind = "uninitialized" | "initialized" | "ready" | "stale";

export interface SemanticIndexedDocument {
	path: string;
	content: string;
}

export interface SemanticWorkspacePersistedState {
	version: 1;
	root: string;
	initializedAt: number;
	indexedAt?: number;
	fingerprint?: string;
	indexedFiles: number;
	documents: SemanticIndexedDocument[];
}

export interface SemanticWorkspaceStatus {
	state: SemanticWorkspaceStateKind;
	initialized: boolean;
	ready: boolean;
	indexedFiles: number;
	root: string;
	indexPath: string;
	indexedAt?: number;
	staleReason?: string;
	fingerprint?: string;
	source: "status" | "index";
}

const TEXT_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".json",
	".md",
	".txt",
	".py",
	".rs",
	".go",
	".java",
	".c",
	".cc",
	".cpp",
	".h",
	".hpp",
	".yaml",
	".yml",
	".toml",
	".sh",
	".css",
	".html",
]);

function toPosix(relativePath: string): string {
	return relativePath.split(path.sep).join("/");
}

function isProbablyTextFile(filePath: string): boolean {
	const ext = path.extname(filePath).toLowerCase();
	return TEXT_EXTENSIONS.has(ext) || ext === "";
}

function workspaceFilePath(cwd: string): string {
	return path.join(cwd, CONFIG_DIR_NAME, "semantic-workspace.json");
}

function ensureWorkspaceDir(cwd: string): string {
	const dir = path.join(cwd, CONFIG_DIR_NAME);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function collectCandidateFiles(cwd: string): string[] {
	return globSync("**/*", {
		cwd,
		absolute: true,
		dot: true,
		nodir: true,
		ignore: ["**/node_modules/**", "**/.git/**", `**/${CONFIG_DIR_NAME}/**`],
	}).filter((filePath) => isProbablyTextFile(filePath));
}

function buildFingerprint(cwd: string): string {
	const hash = createHash("sha256");
	for (const filePath of collectCandidateFiles(cwd)) {
		const relativePath = toPosix(path.relative(cwd, filePath));
		const stats = statSync(filePath);
		hash.update(relativePath);
		hash.update(":");
		hash.update(String(stats.size));
		hash.update(":");
		hash.update(String(Math.trunc(stats.mtimeMs)));
		hash.update("\n");
	}
	return hash.digest("hex");
}

function readDocuments(cwd: string): SemanticIndexedDocument[] {
	const docs: SemanticIndexedDocument[] = [];
	for (const filePath of collectCandidateFiles(cwd)) {
		const stats = statSync(filePath);
		if (stats.size > 200_000) continue;
		let content: string;
		try {
			content = readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		if (content.includes("\u0000")) continue;
		docs.push({ path: toPosix(path.relative(cwd, filePath)), content });
	}
	return docs;
}

export function loadSemanticWorkspace(cwd: string): SemanticWorkspacePersistedState | undefined {
	const filePath = workspaceFilePath(cwd);
	if (!existsSync(filePath)) return undefined;
	const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as SemanticWorkspacePersistedState;
	if (parsed.version !== 1) return undefined;
	return parsed;
}

export function initSemanticWorkspace(cwd: string): SemanticWorkspacePersistedState {
	ensureWorkspaceDir(cwd);
	const state: SemanticWorkspacePersistedState = {
		version: 1,
		root: cwd,
		initializedAt: Date.now(),
		indexedFiles: 0,
		documents: [],
	};
	writeSemanticWorkspace(cwd, state);
	return state;
}

export function syncSemanticWorkspace(cwd: string): SemanticWorkspacePersistedState {
	ensureWorkspaceDir(cwd);
	const current = loadSemanticWorkspace(cwd) ?? initSemanticWorkspace(cwd);
	const documents = readDocuments(cwd);
	const fingerprint = buildFingerprint(cwd);
	const next: SemanticWorkspacePersistedState = {
		...current,
		root: cwd,
		indexedAt: Date.now(),
		fingerprint,
		indexedFiles: documents.length,
		documents,
	};
	writeSemanticWorkspace(cwd, next);
	return next;
}

export function writeSemanticWorkspace(cwd: string, state: SemanticWorkspacePersistedState): void {
	ensureWorkspaceDir(cwd);
	writeFileSync(workspaceFilePath(cwd), JSON.stringify(state, null, 2), "utf-8");
}

export function getSemanticWorkspaceStatus(cwd: string): SemanticWorkspaceStatus {
	const persisted = loadSemanticWorkspace(cwd);
	const indexPath = workspaceFilePath(cwd);
	if (!persisted) {
		return {
			state: "uninitialized",
			initialized: false,
			ready: false,
			indexedFiles: 0,
			root: cwd,
			indexPath,
			source: "status",
		};
	}
	if (!persisted.indexedAt || !persisted.fingerprint || persisted.documents.length === 0) {
		return {
			state: "initialized",
			initialized: true,
			ready: false,
			indexedFiles: persisted.indexedFiles,
			root: cwd,
			indexPath,
			indexedAt: persisted.indexedAt,
			source: "status",
		};
	}
	const currentFingerprint = buildFingerprint(cwd);
	if (currentFingerprint !== persisted.fingerprint) {
		return {
			state: "stale",
			initialized: true,
			ready: false,
			indexedFiles: persisted.indexedFiles,
			root: cwd,
			indexPath,
			indexedAt: persisted.indexedAt,
			staleReason: "workspace contents changed since last sync",
			fingerprint: persisted.fingerprint,
			source: "status",
		};
	}
	return {
		state: "ready",
		initialized: true,
		ready: true,
		indexedFiles: persisted.indexedFiles,
		root: cwd,
		indexPath,
		indexedAt: persisted.indexedAt,
		fingerprint: persisted.fingerprint,
		source: "status",
	};
}

export function requireReadySemanticWorkspace(cwd: string): { status: SemanticWorkspaceStatus; state: SemanticWorkspacePersistedState } {
	const status = getSemanticWorkspaceStatus(cwd);
	const state = loadSemanticWorkspace(cwd);
	if (!state || status.state === "uninitialized") {
		throw new Error("Semantic workspace is uninitialized. Run sem_workspace_init, then sem_workspace_sync.");
	}
	if (status.state === "initialized") {
		throw new Error("Semantic workspace is initialized but not indexed. Run sem_workspace_sync before using sem_search.");
	}
	if (status.state === "stale") {
		throw new Error("Semantic workspace index is stale. Run sem_workspace_sync to refresh it before using sem_search.");
	}
	return { status: { ...status, source: "index" }, state };
}
