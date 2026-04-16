import { describe, expect, it } from "vitest";
import { ConcurrencyBudget } from "../src/core/control-plane/concurrency-budget.js";

describe("ConcurrencyBudget", () => {
	it("limits tasks per model key", () => {
		const budget = new ConcurrencyBudget({ perModel: 1, perRole: 2, perRoot: 3 });

		expect(
			budget.tryReserve({ modelKey: "anthropic/claude-sonnet-4-5", role: "worker", rootId: "root-1" }),
		).toBe(true);
		expect(
			budget.tryReserve({ modelKey: "anthropic/claude-sonnet-4-5", role: "reviewer", rootId: "root-1" }),
		).toBe(false);
	});
});
