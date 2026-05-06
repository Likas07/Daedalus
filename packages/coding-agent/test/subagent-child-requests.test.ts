import { describe, expect, test } from "bun:test";
import { SubagentInteractionBroker } from "../src/core/subagents/interaction-broker.js";

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe("brokered subagent child UI requests", () => {
	test("aggregates child select/input/confirm requests through the parent with identity and serial ordering", async () => {
		const select = deferred<string>();
		const input = deferred<string>();
		const confirm = deferred<boolean>();
		const calls: Array<{ method: string; title: string; message?: string }> = [];
		const statuses: Array<string | undefined> = [];
		const ui = {
			select: async (title: string) => {
				calls.push({ method: "select", title });
				return select.promise;
			},
			input: async (title: string) => {
				calls.push({ method: "input", title });
				return input.promise;
			},
			confirm: async (title: string, message = "") => {
				calls.push({ method: "confirm", title, message });
				return confirm.promise;
			},
			setStatus: (_key: string, value: string | undefined) => statuses.push(value),
		} as any;

		const broker = new SubagentInteractionBroker(ui);
		const child = broker.createUIContext({ runId: "child-run-7", agent: "worker", goal: "Collect answers" })!;

		const selected = child.select("Choose path", ["A", "B"]);
		const typed = child.input("What should the child inspect?", "src/**/*.ts");
		const confirmed = child.confirm("Continue with child request?", "Child needs parent approval");

		await Promise.resolve();
		expect(calls.map((call) => call.method)).toEqual(["select"]);
		expect(calls[0].title).toContain("Subagent worker (child-run-7) · Collect answers");
		expect(calls[0].title).toContain("Choose path");
		expect(statuses).toContain("Subagent UI: 2 queued");

		select.resolve("B");
		expect(await selected).toBe("B");
		await Promise.resolve();
		expect(calls.map((call) => call.method)).toEqual(["select", "input"]);
		expect(calls[1].title).toContain("Subagent worker (child-run-7) · Collect answers");
		expect(calls[1].title).toContain("What should the child inspect?");

		input.resolve("src/core/subagents");
		expect(await typed).toBe("src/core/subagents");
		await Promise.resolve();
		expect(calls.map((call) => call.method)).toEqual(["select", "input", "confirm"]);
		expect(calls[2].title).toContain("Subagent worker (child-run-7) · Collect answers");
		expect(calls[2].title).toContain("Continue with child request?");
		expect(calls[2].message).toBe("Child needs parent approval");

		confirm.resolve(true);
		expect(await confirmed).toBe(true);
		expect(statuses.at(-1)).toBeUndefined();
	});
});
