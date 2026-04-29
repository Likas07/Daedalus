import { describe, expect, test } from "bun:test";
import { redactSensitive } from "./redact";

describe("asaas redaction", () => {
	test("redacts recursive token and authorization fields", () => {
		const result = redactSensitive({ access_token: "asaas-token", headers: { Authorization: "Bearer asaas-token" }, nested: { apiKey: "key", harmless: "visible" } });
		expect(result).toEqual({ access_token: "[REDACTED]", headers: { Authorization: "[REDACTED]" }, nested: { apiKey: "[REDACTED]", harmless: "visible" } });
	});
});
