import { describe, expect, test } from "bun:test";
import { resolveAsaasConfig } from "./config";

describe("asaas config", () => {
	test("reports token presence without exposing token", () => {
		const config = resolveAsaasConfig({ ASAAS_ACCESS_TOKEN: "super-secret-token", ASAAS_BASE_URL: "https://api.asaas.com/v3" });
		expect(config.safeStatus).toEqual({ tokenPresent: true, baseUrl: "https://api.asaas.com/v3" });
		expect(JSON.stringify(config.safeStatus)).not.toContain("super-secret-token");
	});

	test("rejects unsafe base URLs", () => {
		for (const baseUrl of ["http://api.asaas.com/v3", "https://evil.example/v3", "https://user:pass@api.asaas.com/v3", "file:///tmp/x"]) {
			expect(() => resolveAsaasConfig({ ASAAS_ACCESS_TOKEN: "x", ASAAS_BASE_URL: baseUrl })).toThrow();
		}
	});
});
