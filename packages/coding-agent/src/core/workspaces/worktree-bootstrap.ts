import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { readWorktreeMetadata, type WorktreeMetadata, writeWorktreeMetadata } from "./worktree-metadata.js";

export interface WorktreeSetupOptions {
	projectRoot: string;
	worktreePath: string;
	includeIgnored?: boolean;
}

export function chooseDependencySetupCommand(projectRoot: string): string[] | undefined {
	if (existsSync(join(projectRoot, "bun.lock")) || existsSync(join(projectRoot, "bun.lockb")))
		return ["bun", "install"];
	if (existsSync(join(projectRoot, "pnpm-lock.yaml"))) return ["pnpm", "install"];
	if (existsSync(join(projectRoot, "yarn.lock"))) return ["yarn", "install"];
	if (existsSync(join(projectRoot, "package-lock.json")) || existsSync(join(projectRoot, "npm-shrinkwrap.json")))
		return ["npm", "install"];
	if (existsSync(join(projectRoot, "package.json"))) return ["bun", "install"];
	return undefined;
}

function isSafeRelativeIncludePath(value: string): boolean {
	if (!value || isAbsolute(value)) return false;
	const normalized = value.replaceAll("\\", "/");
	if (normalized.split("/").some((part) => part === ".." || part === ".git")) return false;
	return true;
}

function assertInside(root: string, path: string): void {
	const rel = relative(root, path);
	if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return;
	throw new Error(`Unsafe .worktreeinclude path escapes repository: ${path}`);
}

export function readWorktreeInclude(projectRoot: string): string[] {
	const includePath = join(projectRoot, ".worktreeinclude");
	if (!existsSync(includePath)) return [];
	return readFileSync(includePath, "utf8")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"));
}

export function applyWorktreeInclude(projectRoot: string, worktreePath: string): string[] {
	const copied: string[] = [];
	for (const entry of readWorktreeInclude(projectRoot)) {
		if (!isSafeRelativeIncludePath(entry)) throw new Error(`Unsafe .worktreeinclude entry: ${entry}`);
		const source = resolve(projectRoot, entry);
		const destination = resolve(worktreePath, entry);
		assertInside(projectRoot, source);
		assertInside(worktreePath, destination);
		if (!existsSync(source)) continue;
		const stat = lstatSync(source);
		mkdirSync(dirname(destination), { recursive: true });
		if (stat.isDirectory()) {
			symlinkSync(source, destination, "dir");
		} else if (stat.isFile()) {
			copyFileSync(source, destination);
		} else {
			continue;
		}
		copied.push(entry.split(sep).join("/"));
	}
	return copied;
}

function updateSetupStatus(worktreePath: string, status: WorktreeMetadata["setup"]["status"]): void {
	const metadata = readWorktreeMetadata(worktreePath);
	if (!metadata) return;
	writeWorktreeMetadata(worktreePath, {
		...metadata,
		setup: { status, updatedAt: new Date().toISOString() },
	});
}

export function runWorktreeSetup(options: WorktreeSetupOptions): { command?: string[]; included: string[] } {
	updateSetupStatus(options.worktreePath, "setup_pending");
	try {
		const included =
			options.includeIgnored === false ? [] : applyWorktreeInclude(options.projectRoot, options.worktreePath);
		const command = chooseDependencySetupCommand(options.projectRoot);
		if (command) {
			const result = Bun.spawnSync(command, { cwd: options.worktreePath, stdout: "pipe", stderr: "pipe" });
			if (result.exitCode !== 0) {
				throw new Error(`Worktree setup failed: ${command.join(" ")}\n${result.stderr.toString()}`);
			}
		}
		updateSetupStatus(options.worktreePath, "setup_complete");
		return { command, included };
	} catch (error) {
		updateSetupStatus(options.worktreePath, "setup_failed");
		throw error;
	}
}
