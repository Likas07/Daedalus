import { describe, expect, test } from "bun:test";
import { classifyAsaasRequest, confirmAsaasMutation, normalizeAsaasPath } from "./guards";

describe("asaas guards", () => {
	test("normalizes safe relative paths and rejects escape attempts", () => {
		expect(normalizeAsaasPath("customers")).toBe("/customers");
		for (const path of ["https://api.asaas.com/v3/customers", "//evil.example/x", "../customers", "", "/../x"]) expect(() => normalizeAsaasPath(path)).toThrow();
	});
	test("classifies request risk", () => {
		expect(classifyAsaasRequest("GET", "https://api.asaas.com/v3", "/customers")).toBe("read");
		expect(classifyAsaasRequest("POST", "https://sandbox.asaas.com/api/v3", "/customers")).toBe("write");
		expect(classifyAsaasRequest("DELETE", "https://sandbox.asaas.com/api/v3", "/customers/cus_123")).toBe("destructive");
		expect(classifyAsaasRequest("POST", "https://api.asaas.com/v3", "/subscriptions")).toBe("production-write");
	});
	test("blocks live mutation without UI and honors UI cancellation", async () => {
		await expect(confirmAsaasMutation({ hasUI: false } as never, { method: "POST", path: "/customers", dryRun: false, baseUrl: "https://api.asaas.com/v3" })).rejects.toThrow();
		await expect(confirmAsaasMutation({ hasUI: true, ui: { confirm: async () => false } } as never, { method: "POST", path: "/customers", dryRun: false, baseUrl: "https://api.asaas.com/v3" })).rejects.toThrow();
	});
});
