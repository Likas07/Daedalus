import { expect, test } from "bun:test";
import { openAppServerDatabase, runMigrations } from "..";
import { OperationIdempotencyService } from "./operation-idempotency-service";

test("operation idempotency replays completed same-method same-payload results", async () => {
	const database = openAppServerDatabase(":memory:");
	runMigrations(database);
	const service = new OperationIdempotencyService({ database });
	let calls = 0;

	const first = await service.run(
		{ operationId: "op-1", method: "session/start", payload: { prompt: "hi" } },
		async () => {
			calls += 1;
			return { sessionId: "session-1" };
		},
	);
	const second = await service.run(
		{ operationId: "op-1", method: "session/start", payload: { prompt: "hi" } },
		async () => {
			calls += 1;
			return { sessionId: "session-2" };
		},
	);

	expect(first).toEqual({ sessionId: "session-1" });
	expect(second).toEqual({ sessionId: "session-1" });
	expect(calls).toBe(1);
	database.close();
});

test("operation idempotency rejects changed payloads and in-progress duplicates", () => {
	const database = openAppServerDatabase(":memory:");
	runMigrations(database);
	const service = new OperationIdempotencyService({ database });

	expect(service.begin({ operationId: "op-1", method: "turn/start", payload: { prompt: "one" } })).toEqual({
		status: "started",
	});
	expect(() => service.begin({ operationId: "op-1", method: "turn/start", payload: { prompt: "two" } })).toThrow(
		"Operation id conflict",
	);
	expect(() => service.begin({ operationId: "op-1", method: "turn/start", payload: { prompt: "one" } })).toThrow(
		"Operation already in progress",
	);
	database.close();
});
