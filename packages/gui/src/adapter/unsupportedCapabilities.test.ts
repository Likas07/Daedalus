import { describe, expect, it } from "vitest";
import { createDaedalusT3Api } from "./daedalusOrchestration";
import { type UnsupportedCapability, unsupported, unsupportedCapabilityReasons } from "./unsupportedCapabilities";

const capabilities: UnsupportedCapability[] = [
	"remote-environments",
	"server-exposure",
	"terminal-restart",
	"git-push",
	"pull-request-mutation",
	"provider-cli-install",
];

describe("unsupported capability registry", () => {
	it("returns explicit unsupported results for every registered capability", () => {
		for (const capability of capabilities) {
			expect(unsupported(capability)).toEqual({
				ok: false,
				capability,
				reason: unsupportedCapabilityReasons[capability],
			});
			expect(unsupported(capability).reason.length).toBeGreaterThan(0);
		}
	});

	it("does not fake success for representative T3 facade methods", async () => {
		const api = createDaedalusT3Api({} as never);

		await expect(api.terminal.restart()).resolves.toMatchObject({ ok: false, capability: "terminal-restart" });
		await expect(api.git.push()).resolves.toMatchObject({ ok: false, capability: "git-push" });
		await expect(api.git.resolvePullRequest()).resolves.toMatchObject({
			ok: false,
			capability: "pull-request-mutation",
		});
		await expect(api.server.expose()).resolves.toMatchObject({ ok: false, capability: "server-exposure" });
		await expect(api.server.installProviderCli()).resolves.toMatchObject({
			ok: false,
			capability: "provider-cli-install",
		});
	});
});
