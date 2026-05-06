import { describe, expect, it } from "vitest";
import { createDaedalusT3Api } from "../adapter/daedalusOrchestration";

describe("no visible no-op client actions", () => {
	it("returns explicit unsupported results instead of silently succeeding", async () => {
		const api = createDaedalusT3Api({} as never);

		await expect(api.terminal.restart()).resolves.toMatchObject({ ok: false, capability: "terminal-restart" });
		await expect(api.git.push()).resolves.toMatchObject({ ok: false, capability: "git-push" });
		await expect(api.server.expose()).resolves.toMatchObject({ ok: false, capability: "server-exposure" });
	});
});
