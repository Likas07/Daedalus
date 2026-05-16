import { describe, expect, test } from "bun:test";
import { repairSubagentEnvelope } from "./result-repair.js";
import { validateSubagentEnvelope } from "./result-validation.js";

describe("repairSubagentEnvelope", () => {
	test("strips additional properties and returns a valid envelope", () => {
		const repaired = repairSubagentEnvelope({
			task: "lane",
			status: "completed",
			summary: "done",
			output: "body",
			extra: "remove me",
		});
		expect(repaired.ok).toBe(true);
		if (!repaired.ok) throw new Error(repaired.error);
		expect(repaired.envelope).toEqual({ task: "lane", status: "completed", summary: "done", output: "body" });
		expect(repaired.repairs).toContain("stripped additional properties: extra");
		expect(validateSubagentEnvelope(repaired.envelope)).toBeUndefined();
	});

	test("coerces object output to stable JSON text", () => {
		const repaired = repairSubagentEnvelope({
			task: "lane",
			status: "partial",
			summary: "some",
			output: { ok: true },
		});
		expect(repaired.ok).toBe(true);
		if (!repaired.ok) throw new Error(repaired.error);
		expect(repaired.envelope.output).toBe(JSON.stringify({ ok: true }, null, 2));
		expect(repaired.repairs).toContain("coerced output object to JSON string");
	});

	test("normalizes only unambiguous status aliases", () => {
		expect(repairSubagentEnvelope({ task: "t", status: "complete", summary: "s", output: "o" })).toMatchObject({
			ok: true,
		});
		expect(repairSubagentEnvelope({ task: "t", status: "blocked ", summary: "s", output: "o" })).toMatchObject({
			ok: true,
		});
		expect(repairSubagentEnvelope({ task: "t", status: "failed", summary: "s", output: "o" })).toMatchObject({
			ok: false,
		});
	});

	test("rejects missing required fields after repair", () => {
		const repaired = repairSubagentEnvelope({ task: "t", status: "completed", summary: "s" });
		expect(repaired.ok).toBe(false);
		if (repaired.ok) throw new Error("expected repair failure");
		expect(repaired.error).toContain("required property");
	});
});
