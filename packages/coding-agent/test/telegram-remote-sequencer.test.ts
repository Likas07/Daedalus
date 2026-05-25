import { describe, expect, it } from "vitest";
import { PerChatSequencer } from "../src/extensions/telegram-remote/sequencer.js";

describe("PerChatSequencer", () => {
	it("runs work from the same chat in enqueue order", async () => {
		const sequencer = new PerChatSequencer();
		const firstGate = deferred<void>();
		const events: string[] = [];

		const first = sequencer.enqueue(1, async () => {
			events.push("first:start");
			await firstGate.promise;
			events.push("first:end");
			return "first";
		});
		const second = sequencer.enqueue(1, async () => {
			events.push("second:start");
			return "second";
		});

		await flushMicrotasks();
		expect(events).toEqual(["first:start"]);

		firstGate.resolve();
		await expect(first).resolves.toBe("first");
		await expect(second).resolves.toBe("second");
		expect(events).toEqual(["first:start", "first:end", "second:start"]);
	});

	it("allows independent chats to make progress independently", async () => {
		const sequencer = new PerChatSequencer();
		const chatOneGate = deferred<void>();
		const events: string[] = [];

		const chatOne = sequencer.enqueue(1, async () => {
			events.push("chat1:start");
			await chatOneGate.promise;
			events.push("chat1:end");
		});
		const chatTwo = sequencer.enqueue(2, async () => {
			events.push("chat2:start");
			return "chat2";
		});

		await expect(chatTwo).resolves.toBe("chat2");
		expect(events).toEqual(["chat1:start", "chat2:start"]);

		chatOneGate.resolve();
		await chatOne;
		expect(events).toEqual(["chat1:start", "chat2:start", "chat1:end"]);
	});

	it("continues the per-chat queue after a failed task", async () => {
		const sequencer = new PerChatSequencer();
		const events: string[] = [];

		const failed = sequencer.enqueue(1, async () => {
			events.push("failed:start");
			throw new Error("boom");
		});
		const next = sequencer.enqueue(1, async () => {
			events.push("next:start");
			return "next";
		});

		await expect(failed).rejects.toThrow("boom");
		await expect(next).resolves.toBe("next");
		expect(events).toEqual(["failed:start", "next:start"]);
	});

	it("cleans up settled chat queues", async () => {
		const sequencer = new PerChatSequencer();

		expect(sequencer.getPendingChatCount()).toBe(0);
		await sequencer.enqueue(1, async () => "done");
		await flushMicrotasks();
		expect(sequencer.getPendingChatCount()).toBe(0);
	});
});

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

function deferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (error: unknown) => void;
} {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});
	return { promise, resolve, reject };
}
