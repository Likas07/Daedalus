import { describe, expect, test } from "bun:test";
import { type TerminalProcess, TerminalService, type TerminalSpawner } from "./terminal-service";

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe("TerminalService", () => {
	test("detach and reattach replay outputs once in order", async () => {
		const exit = deferred<void>();
		let onOutput!: (data: string) => void;
		const writes: string[] = [];
		const notifications: unknown[] = [];
		const spawn: TerminalSpawner = (input): TerminalProcess => {
			onOutput = input.onOutput;
			return { stdin: { write: (data) => writes.push(data) }, exited: exit.promise, kill: () => exit.resolve() };
		};
		const service = new TerminalService({
			spawn,
			publish: (message) => notifications.push(message),
			maxScrollbackChunks: 10,
		});
		const terminal = service.create({ cwd: "/tmp", shell: "/bin/sh" });

		onOutput("one\n");
		expect(service.detach(terminal.id).attached).toBe(false);
		onOutput("two\n");
		onOutput("three\n");
		expect(notifications).toHaveLength(1);

		expect(service.replay(terminal.id, 1).chunks.map((chunk) => chunk.data)).toEqual(["two\n", "three\n"]);
		expect(service.attach(terminal.id).attached).toBe(true);
		expect(service.replay(terminal.id, 3).chunks).toEqual([]);
		onOutput("four\n");
		expect(service.replay(terminal.id, 1).chunks.map((chunk) => chunk.data)).toEqual(["two\n", "three\n", "four\n"]);
		expect(writes).toEqual([]);
	});
});
