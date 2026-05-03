import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CreateAgentSessionRuntimeFactory, createAgentSessionRuntime } from "../agent-session-runtime";
import { createAgentSessionServices } from "../agent-session-services";
import { SessionManager } from "../session-manager";
import type { WorkspaceTarget } from "./types";

function target(cwd: string, id: string): WorkspaceTarget {
	return { id, cwd, projectRoot: cwd, isolationMode: "shared_cwd", validationStatus: "valid" };
}

function makeSession(sessionManager: SessionManager, state?: { streaming?: boolean; pending?: number }) {
	return {
		sessionManager,
		sessionFile: sessionManager.getSessionFile(),
		isStreaming: state?.streaming ?? false,
		pendingMessageCount: state?.pending ?? 0,
		dispose: () => {},
	} as never;
}

describe("AgentSessionRuntime workspace targets", () => {
	test("runtime creation accepts workspaceTarget, uses target cwd, and stores identity", async () => {
		const rawCwd = mkdtempSync(join(tmpdir(), "daedalus-runtime-raw-"));
		const targetCwd = mkdtempSync(join(tmpdir(), "daedalus-runtime-target-"));
		const workspaceTarget = target(targetCwd, "target-a");
		const seen: Array<{ cwd: string; workspaceTarget?: WorkspaceTarget }> = [];
		const factory: CreateAgentSessionRuntimeFactory = async (options) => {
			seen.push({ cwd: options.cwd, workspaceTarget: options.workspaceTarget });
			return {
				session: makeSession(options.sessionManager),
				services: {
					cwd: options.cwd,
					agentDir: options.agentDir,
					workspaceTarget: options.workspaceTarget,
					diagnostics: [],
				} as never,
				diagnostics: [],
				extensionsResult: {} as never,
			};
		};
		const sessionManager = SessionManager.create(targetCwd, join(rawCwd, ".daedalus", "sessions"));
		const runtime = await createAgentSessionRuntime(factory, {
			cwd: rawCwd,
			agentDir: join(rawCwd, ".daedalus"),
			sessionManager,
			workspaceTarget,
			applyProcessCwd: false,
		});

		expect(runtime.cwd).toBe(targetCwd);
		expect(runtime.workspaceTarget?.id).toBe("target-a");
		expect(seen[0]).toEqual({ cwd: targetCwd, workspaceTarget });
		expect(sessionManager.getWorkspaceIdentity()?.workspace.id).toBe("target-a");
		expect(sessionManager.getWorkspaceIdentity()?.workspace.cwd).toBe(targetCwd);
	});

	test("services resolve current target when safe and degrade for legacy non-git cwd", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "daedalus-runtime-legacy-"));
		const services = await createAgentSessionServices({ cwd, agentDir: join(cwd, ".daedalus") });
		expect(services.cwd).toBe(cwd);
		expect(services.workspaceTarget?.cwd).toBe(cwd);
		expect(services.workspaceTarget?.isolationMode).toBe("shared_cwd");
	});

	test("switchWorkspaceTarget rejects non-idle sessions", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "daedalus-runtime-busy-"));
		const sessionManager = SessionManager.create(cwd, join(cwd, ".daedalus", "sessions"));
		const factory: CreateAgentSessionRuntimeFactory = async (options) => ({
			session: makeSession(options.sessionManager, { streaming: true }),
			services: { cwd: options.cwd, agentDir: options.agentDir, diagnostics: [], workspaceService: {} } as never,
			diagnostics: [],
			extensionsResult: {} as never,
		});
		const runtime = await createAgentSessionRuntime(factory, {
			cwd,
			agentDir: join(cwd, ".daedalus"),
			sessionManager,
			applyProcessCwd: false,
		});
		await expect(runtime.switchWorkspaceTarget({ workspaceTarget: target(cwd, "next") })).rejects.toThrow(
			"Cannot switch workspace target",
		);
	});

	test("switchWorkspaceTarget opens target, recreates services, persists identity, and returns transition info", async () => {
		const firstCwd = mkdtempSync(join(tmpdir(), "daedalus-runtime-first-"));
		const nextCwd = mkdtempSync(join(tmpdir(), "daedalus-runtime-next-"));
		const firstTarget = target(firstCwd, "first");
		const nextTarget = target(nextCwd, "next");
		const calls: string[] = [];
		const factory: CreateAgentSessionRuntimeFactory = async (options) => {
			calls.push(options.cwd);
			return {
				session: makeSession(options.sessionManager),
				services: {
					cwd: options.cwd,
					agentDir: options.agentDir,
					diagnostics: [],
					workspaceTarget: options.workspaceTarget,
					workspaceService: { openTarget: () => nextTarget },
				} as never,
				diagnostics: [],
				extensionsResult: {} as never,
			};
		};
		const runtime = await createAgentSessionRuntime(factory, {
			cwd: firstCwd,
			agentDir: join(firstCwd, ".daedalus"),
			sessionManager: SessionManager.create(firstCwd, join(firstCwd, ".daedalus", "sessions")),
			workspaceTarget: firstTarget,
			applyProcessCwd: false,
		});

		const transition = await runtime.switchWorkspaceTarget({ id: "next" });

		expect(calls).toEqual([firstCwd, nextCwd]);
		expect(runtime.cwd).toBe(nextCwd);
		expect(runtime.workspaceTarget?.id).toBe("next");
		expect(runtime.session.sessionManager.getWorkspaceIdentity()?.workspace.id).toBe("next");
		expect(transition.previousWorkspaceTarget?.id).toBe("first");
		expect(transition.workspaceTarget.id).toBe("next");
	});
});
