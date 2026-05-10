import { describe, expect, test } from "bun:test";
import { RequestSerializer, serializationScopeForRequest } from "./request-serialization";

describe("request serialization", () => {
	test("serializes exclusive thread requests FIFO", async () => {
		const serializer = new RequestSerializer();
		const events: string[] = [];
		let releaseFirst!: () => void;
		const firstMayFinish = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});

		const first = serializer.run(
			{ method: "turn.start", params: { threadId: "thread-1", prompt: "first" } } as never,
			async () => {
				events.push("first:start");
				await firstMayFinish;
				events.push("first:end");
				return "first";
			},
		);
		const second = serializer.run(
			{ method: "turn.start", params: { threadId: "thread-1", prompt: "second" } } as never,
			async () => {
				events.push("second:start");
				return "second";
			},
		);

		await Bun.sleep(10);
		expect(events).toEqual(["first:start"]);
		releaseFirst();
		expect(await Promise.all([first, second])).toEqual(["first", "second"]);
		expect(events).toEqual(["first:start", "first:end", "second:start"]);
	});

	test("allows read-only replay requests to run concurrently", async () => {
		const serializer = new RequestSerializer();
		const events: string[] = [];
		let releaseFirst!: () => void;
		const firstMayFinish = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});

		const first = serializer.run(
			{ method: "thread.replay", params: { threadId: "thread-1", limit: 1 } } as never,
			async () => {
				events.push("first:start");
				await firstMayFinish;
				events.push("first:end");
				return "first";
			},
		);
		const second = serializer.run(
			{ method: "thread.replay", params: { threadId: "thread-1", limit: 10 } } as never,
			async () => {
				events.push("second:start");
				return "second";
			},
		);

		await Bun.sleep(10);
		expect(events).toEqual(["first:start", "second:start"]);
		releaseFirst();
		expect(await Promise.all([first, second])).toEqual(["first", "second"]);
	});

	test("classifies documented exclusive scopes", () => {
		expect(serializationScopeForRequest({ method: "settings/set", params: {} } as never)).toEqual({
			kind: "exclusive",
			key: "global",
		});
		expect(
			serializationScopeForRequest({ method: "worktree/create", params: { projectId: "project-1" } } as never),
		).toEqual({
			kind: "exclusive",
			key: "project:project-1",
		});
		expect(
			serializationScopeForRequest({ method: "v1.approval.decide", params: { threadId: "thread-1" } } as never),
		).toEqual({
			kind: "exclusive",
			key: "thread:thread-1",
		});
	});
});
