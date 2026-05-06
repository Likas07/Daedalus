import { describe, expect, it } from "vitest";
import { DAEDALUS_ACCESS_MODE_HELP } from "./adapter/daedalusSettings";
import { providerCliInstallUnsupported } from "./adapter/daedalusSettings";

describe("phase 4 differentiation", () => {
	it("keeps Daedalus safety language visible in T3 compatibility settings", () => {
		expect(DAEDALUS_ACCESS_MODE_HELP["approval-required"]).toContain("Daedalus");
		expect(DAEDALUS_ACCESS_MODE_HELP["approval-required"]).toContain("hard-block safety policy");
		expect(DAEDALUS_ACCESS_MODE_HELP["full-access"]).toContain("hard-block safety policy");
	});

	it("keeps provider setup differentiated from T3 CLI installation", () => {
		expect(providerCliInstallUnsupported()).toMatchObject({
			ok: false,
			capability: "provider-cli-install",
		});
		expect(providerCliInstallUnsupported().reason).toContain("Daedalus uses native provider auth");
	});
});
