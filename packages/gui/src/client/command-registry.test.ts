import { describe, expect, it } from "vitest";
import { createDaedalusT3Api } from "../adapter/daedalusOrchestration";

describe("client command registry", () => {
	it("exposes unsupported visible commands as explicit command results", async () => {
		const api = createDaedalusT3Api({} as never);

		await expect(api.git.resolvePullRequest()).resolves.toMatchObject({
			ok: false,
			capability: "pull-request-mutation",
		});
		await expect(api.server.installProviderCli()).resolves.toMatchObject({
			ok: false,
			capability: "provider-cli-install",
		});
	});
});
