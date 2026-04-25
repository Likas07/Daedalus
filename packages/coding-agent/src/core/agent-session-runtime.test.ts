import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CreateAgentSessionRuntimeFactory, createAgentSessionRuntime } from "./agent-session-runtime";
import { SessionManager } from "./session-manager";

function makeFactory(targetCwd: string): CreateAgentSessionRuntimeFactory {
	return async ({ sessionManager }) => ({
		session: {
			sessionManager,
			dispose: () => {},
		} as never,
		services: {
			cwd: targetCwd,
			agentDir: join(targetCwd, ".daedalus"),
		} as never,
		diagnostics: [],
		extensionsResult: {} as never,
	});
}

describe("createAgentSessionRuntime", () => {
	test("applies process cwd by default", async () => {
		const originalCwd = process.cwd();
		const targetCwd = mkdtempSync(join(tmpdir(), "daedalus-runtime-cwd-"));
		try {
			await createAgentSessionRuntime(makeFactory(targetCwd), {
				cwd: targetCwd,
				agentDir: join(targetCwd, ".daedalus"),
				sessionManager: SessionManager.create(targetCwd, join(targetCwd, ".daedalus", "sessions")),
			});
			expect(process.cwd()).toBe(targetCwd);
		} finally {
			process.chdir(originalCwd);
		}
	});

	test("keeps process cwd isolated when applyProcessCwd is false", async () => {
		const originalCwd = process.cwd();
		const targetCwd = mkdtempSync(join(tmpdir(), "daedalus-runtime-isolated-cwd-"));
		try {
			const runtime = await createAgentSessionRuntime(makeFactory(targetCwd), {
				cwd: targetCwd,
				agentDir: join(targetCwd, ".daedalus"),
				sessionManager: SessionManager.create(targetCwd, join(targetCwd, ".daedalus", "sessions")),
				applyProcessCwd: false,
			});
			expect(runtime.cwd).toBe(targetCwd);
			expect(process.cwd()).toBe(originalCwd);
		} finally {
			process.chdir(originalCwd);
		}
	});
});
