import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OLLAMA_EMBED_REQUEST_TIMEOUT_ENV } from "../src/extensions/daedalus/tools/semantic-config.js";
import {
	getSemanticWorkspaceStatus,
	syncSemanticWorkspace,
} from "../src/extensions/daedalus/tools/semantic-workspace.js";

export const SEMANTIC_TEST_SETUP_TIMEOUT_MS = positiveIntegerEnv("DAEDALUS_SEMANTIC_TEST_SETUP_TIMEOUT_MS", 20_000);
setDefaultOllamaRequestTimeout();

let semanticWorkspaceIndexingAvailablePromise: Promise<boolean> | undefined;
let semanticWorkspaceIndexingUnavailableReason: string | undefined;

interface SemanticSetupOptions {
	label: string;
	reasonPrefix?: string;
	timeoutMs?: number;
}

function positiveIntegerEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) return fallback;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function setDefaultOllamaRequestTimeout(): void {
	const parsed = Number.parseInt(process.env[OLLAMA_EMBED_REQUEST_TIMEOUT_ENV] ?? "", 10);
	if (Number.isFinite(parsed) && parsed > 0) return;
	process.env[OLLAMA_EMBED_REQUEST_TIMEOUT_ENV] = String(SEMANTIC_TEST_SETUP_TIMEOUT_MS);
}

function formatDuration(ms: number): string {
	return ms >= 1000 && ms % 1000 === 0 ? `${ms / 1000}s` : `${ms}ms`;
}

function formatError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}

function semanticWorkspaceNotIndexedReason(cwd: string): string | undefined {
	const status = getSemanticWorkspaceStatus(cwd);
	if (status.ready === true && status.chunkCount > 0) return undefined;
	return `Semantic workspace is not indexed (state=${status.state}, ready=${status.ready}, chunks=${status.chunkCount})`;
}

export function getSemanticWorkspaceIndexingUnavailableReason(): string | undefined {
	return semanticWorkspaceIndexingUnavailableReason;
}

export function skipSemanticTest(reason: string): true {
	console.warn(`[semantic integration skipped] ${reason}`);
	return true;
}

export function skipIfSemanticWorkspaceNotIndexed(cwd: string): boolean {
	const reason = semanticWorkspaceNotIndexedReason(cwd);
	if (!reason) return false;
	return skipSemanticTest(reason);
}

export async function withSemanticTestTimeout<T>(
	operation: () => Promise<T>,
	{ label, timeoutMs = SEMANTIC_TEST_SETUP_TIMEOUT_MS }: Pick<SemanticSetupOptions, "label" | "timeoutMs">,
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<never>((_resolve, reject) => {
		timeout = setTimeout(() => {
			reject(new Error(`${label} exceeded ${formatDuration(timeoutMs)} semantic setup timeout`));
		}, timeoutMs);
	});
	try {
		return await Promise.race([operation(), timeoutPromise]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

export async function semanticSetupOrSkip<T>(
	setup: () => Promise<T>,
	{
		label,
		reasonPrefix = "Semantic integration setup unavailable",
		timeoutMs = SEMANTIC_TEST_SETUP_TIMEOUT_MS,
	}: SemanticSetupOptions,
): Promise<T | undefined> {
	try {
		return await withSemanticTestTimeout(setup, { label, timeoutMs });
	} catch (error) {
		skipSemanticTest(`${reasonPrefix}: ${formatError(error)}`);
		return undefined;
	}
}

export async function semanticOperationOrSkip(
	operation: () => Promise<unknown>,
	options: SemanticSetupOptions,
): Promise<boolean> {
	const result = await semanticSetupOrSkip(async () => {
		await operation();
		return true;
	}, options);
	return result !== true;
}

export async function syncSemanticWorkspaceOrSkip(
	cwd: string,
	options: Partial<SemanticSetupOptions> = {},
): Promise<boolean> {
	const skipped = await semanticOperationOrSkip(() => syncSemanticWorkspace(cwd), {
		label: options.label ?? `semantic workspace sync for ${cwd}`,
		reasonPrefix: options.reasonPrefix ?? `Semantic workspace sync unavailable for ${cwd}`,
		timeoutMs: options.timeoutMs,
	});
	if (skipped) return true;
	return skipIfSemanticWorkspaceNotIndexed(cwd);
}

export async function isSemanticWorkspaceIndexingAvailable(): Promise<boolean> {
	semanticWorkspaceIndexingAvailablePromise ??= probeSemanticWorkspaceIndexingAvailability();
	return semanticWorkspaceIndexingAvailablePromise;
}

async function probeSemanticWorkspaceIndexingAvailability(): Promise<boolean> {
	const tempDir = join(tmpdir(), `daedalus-semantic-skip-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	try {
		mkdirSync(join(tempDir, "src"), { recursive: true });
		writeFileSync(join(tempDir, "src", "probe.ts"), "export const semanticProbe = true;\n");
		await withSemanticTestTimeout(() => syncSemanticWorkspace(tempDir), {
			label: "semantic workspace availability probe",
		});
		semanticWorkspaceIndexingUnavailableReason = semanticWorkspaceNotIndexedReason(tempDir);
		return semanticWorkspaceIndexingUnavailableReason === undefined;
	} catch (error) {
		semanticWorkspaceIndexingUnavailableReason = `Semantic workspace availability probe failed: ${formatError(error)}`;
		return false;
	} finally {
		if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
	}
}
