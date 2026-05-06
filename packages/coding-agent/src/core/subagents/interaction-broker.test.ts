import { describe, expect, test } from "bun:test";
import { SubagentInteractionBroker } from "./interaction-broker.js";

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe("SubagentInteractionBroker", () => {
	test("serializes blocking requests and annotates titles", async () => {
		const first = deferred<string>();
		const calls: string[] = [];
		const statuses: Array<string | undefined> = [];
		const ui = {
			select: async (title: string) => {
				calls.push(title);
				return first.promise;
			},
			input: async (title: string) => {
				calls.push(title);
				return "typed";
			},
			setStatus: (_key: string, value: string | undefined) => statuses.push(value),
		} as any;
		const broker = new SubagentInteractionBroker(ui);
		const child = broker.createUIContext({ runId: "run-1", agent: "worker", goal: "fix" })!;
		const a = child.select("Pick", ["a"]);
		const b = child.input("Question");
		await Promise.resolve();
		expect(calls).toHaveLength(1);
		expect(calls[0]).toContain("Subagent worker (run-1) · fix");
		first.resolve("a");
		expect(await a).toBe("a");
		expect(await b).toBe("typed");
		expect(calls[1]).toContain("Question");
		expect(statuses.at(-1)).toBeUndefined();
	});

	test("returns cancellation-compatible values without parent UI", async () => {
		const broker = new SubagentInteractionBroker(undefined);
		expect(broker.createUIContext({ runId: "run", agent: "worker" })).toBeUndefined();
	});
});
