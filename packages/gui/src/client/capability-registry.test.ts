import { describe, expect, it } from "vitest";
import { type UnsupportedCapability, unsupported, unsupportedCapabilityReasons } from "../adapter/unsupportedCapabilities";

const unsupportedCapabilities: UnsupportedCapability[] = [
	"remote-environments",
	"server-exposure",
	"terminal-restart",
	"git-push",
	"pull-request-mutation",
	"provider-cli-install",
];

describe("client capability registry", () => {
	it("has explicit reasons for unsupported visible capabilities", () => {
		for (const capability of unsupportedCapabilities) {
			expect(unsupported(capability)).toEqual({
				ok: false,
				capability,
				reason: unsupportedCapabilityReasons[capability],
			});
			expect(unsupportedCapabilityReasons[capability]).not.toHaveLength(0);
		}
	});
});
