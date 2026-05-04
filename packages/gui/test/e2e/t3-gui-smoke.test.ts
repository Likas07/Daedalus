import { describe, expect, test, vi } from "vitest";
import { loadDaedalusEnvironment } from "../../src/adapter/daedalusBootstrap";
import { createDaedalusGitAdapter } from "../../src/adapter/daedalusGit";
import { createDaedalusT3Api, createTerminalApi } from "../../src/adapter/daedalusOrchestration";
import { unsupported, unsupportedCapabilityReasons } from "../../src/adapter/unsupportedCapabilities";
import { buildThreadRouteParams, resolveThreadRouteTarget } from "../../src/threadRoutes";
import { scopeThreadRef } from "../../src/vendor/t3/client-runtime";

describe("T3-derived Daedalus GUI smoke", () => {
	test("loads the local Daedalus bootstrap as an authenticated T3-compatible environment", async () => {
		vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
			expect(String(input)).toBe("/api/gui/bootstrap");
			return new Response(
				JSON.stringify({
					wsUrl: "ws://127.0.0.1:47329/ws",
					token: "local-smoke-token",
					projectRoot: "/tmp/daedalus-gui-smoke",
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		});
		vi.stubGlobal("window", {});

		await expect(loadDaedalusEnvironment()).resolves.toEqual({
			id: "local-daedalus",
			label: "Daedalus Local",
			httpUrl: "http://127.0.0.1:47329",
			wsUrl: "ws://127.0.0.1:47329/ws",
			token: "local-smoke-token",
			projectRoot: "/tmp/daedalus-gui-smoke",
			authenticated: true,
		});
	});

	test("keeps sidebar/thread routes and composer API seams wired for opening a test thread", async () => {
		const threadRef = scopeThreadRef("local-daedalus", "thread-smoke");
		expect(buildThreadRouteParams(threadRef)).toEqual({
			environmentId: "local-daedalus",
			threadId: "thread-smoke",
		});
		expect(resolveThreadRouteTarget({ environmentId: "local-daedalus", threadId: "thread-smoke" })).toEqual({
			kind: "server",
			threadRef,
		});

		const calls: Array<{ method: string; params: unknown }> = [];
		const api = createDaedalusT3Api({
			request: async (method: string, params: unknown) => {
				calls.push({ method, params });
				if (method === "composer/command-list") return { commands: [{ id: "ask", label: "Ask Daedalus" }] };
				if (method === "composer/file-search") return { files: [{ path: "README.md", label: "README.md" }] };
				if (method === "composer/attachment/save") return { attachmentId: "attachment-smoke" };
				throw new Error(`unexpected method ${method}`);
			},
		} as never);

		await expect(api.projects.commandList({ query: "ask" })).resolves.toMatchObject({
			commands: [expect.any(Object)],
		});
		await expect(api.projects.fileSearch({ query: "README" })).resolves.toMatchObject({
			files: [expect.any(Object)],
		});
		await expect(api.projects.saveAttachment({ name: "note.txt", content: "hello" })).resolves.toMatchObject({
			attachmentId: "attachment-smoke",
		});
		expect(calls.map((call) => call.method)).toEqual([
			"composer/command-list",
			"composer/file-search",
			"composer/attachment/save",
		]);
	});

	test("does not fake-enable unsupported T3 desktop controls", async () => {
		expect(unsupported("remote-environments")).toEqual({
			ok: false,
			capability: "remote-environments",
			reason: unsupportedCapabilityReasons["remote-environments"],
		});
		await expect(
			createTerminalApi({} as never).restart({ terminalId: "terminal-smoke" } as never),
		).resolves.toMatchObject({
			ok: false,
			capability: "terminal-restart",
		});
		const git = createDaedalusGitAdapter({} as never);
		await expect(git.push()).resolves.toMatchObject({ ok: false, capability: "git-push" });
		await expect(git.resolvePullRequest()).resolves.toMatchObject({ ok: false, capability: "pull-request-mutation" });
	});
});
