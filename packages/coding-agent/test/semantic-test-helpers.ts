import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	getSemanticWorkspaceStatus,
	syncSemanticWorkspace,
} from "../src/extensions/daedalus/tools/semantic-workspace.js";

type SkippableTestContext = {
	skip: (reason?: string) => void;
};

let semanticWorkspaceIndexingAvailablePromise: Promise<boolean> | undefined;

function isSkippableTestContext(ctx: unknown): ctx is SkippableTestContext {
	return (
		typeof ctx === "object" && ctx !== null && "skip" in ctx && typeof (ctx as { skip?: unknown }).skip === "function"
	);
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

export function skipSemanticTest(ctx: unknown, reason: string): true {
	if (!isSkippableTestContext(ctx)) {
		throw new Error(`Cannot dynamically skip semantic test: ${reason}`);
	}
	ctx.skip(reason);
	return true;
}

export function skipIfSemanticWorkspaceNotIndexed(ctx: unknown, cwd: string): boolean {
	const reason = semanticWorkspaceNotIndexedReason(cwd);
	if (!reason) return false;
	return skipSemanticTest(ctx, reason);
}

export async function syncSemanticWorkspaceOrSkip(ctx: unknown, cwd: string): Promise<boolean> {
	try {
		await syncSemanticWorkspace(cwd);
	} catch (error) {
		return skipSemanticTest(ctx, `Semantic workspace sync unavailable: ${formatError(error)}`);
	}
	return skipIfSemanticWorkspaceNotIndexed(ctx, cwd);
}

export async function semanticSetupOrSkip<T>(
	ctx: unknown,
	setup: () => Promise<T>,
	reasonPrefix = "Semantic integration setup unavailable",
): Promise<T | undefined> {
	try {
		return await setup();
	} catch (error) {
		skipSemanticTest(ctx, `${reasonPrefix}: ${formatError(error)}`);
		return undefined;
	}
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
		await syncSemanticWorkspace(tempDir);
		return semanticWorkspaceNotIndexedReason(tempDir) === undefined;
	} catch {
		return false;
	} finally {
		if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
	}
}
