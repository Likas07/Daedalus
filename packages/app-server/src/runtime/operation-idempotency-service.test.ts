import { expect, test } from "bun:test";
import { openAppServerDatabase, runMigrations } from "..";
import { OperationIdempotencyService } from "./operation-idempotency-service";

function createService(nowIso = "2026-04-29T12:00:00.000Z") {
	const database = openAppServerDatabase(":memory:");
	runMigrations(database);
	let now = new Date(nowIso);
	const service = new OperationIdempotencyService({
		database,
		clock: () => now,
		leaseTtlMs: 1_000,
		leaseOwnerFactory: ({ operationId, attemptCount }) => `${operationId}-attempt-${attemptCount}`,
	});
	return {
		database,
		service,
		setNow: (nextIso: string) => {
			now = new Date(nextIso);
		},
	};
}

test("operation idempotency replays completed same-method same-payload results", async () => {
	const { database, service } = createService();
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

test("operation idempotency rejects changed payloads and unexpired in-progress duplicates", () => {
	const { database, service } = createService();

	expect(service.begin({ operationId: "op-1", method: "turn/start", payload: { prompt: "one" } })).toEqual({
		status: "started",
		leaseOwner: "op-1-attempt-1",
		leaseExpiresAt: "2026-04-29T12:00:01.000Z",
		attemptCount: 1,
	});
	expect(() => service.begin({ operationId: "op-1", method: "turn/start", payload: { prompt: "two" } })).toThrow(
		"Operation id conflict",
	);
	expect(() => service.begin({ operationId: "op-1", method: "turn/start", payload: { prompt: "one" } })).toThrow(
		"Operation already in progress",
	);
	database.close();
});

test("operation idempotency repairs expired in-progress same-method same-payload leases", () => {
	const { database, service, setNow } = createService();
	const first = service.begin({ operationId: "op-1", method: "turn/start", payload: { prompt: "one" } });
	expect(first.status).toBe("started");

	setNow("2026-04-29T12:00:01.001Z");
	const repaired = service.begin({ operationId: "op-1", method: "turn/start", payload: { prompt: "one" } });

	expect(repaired).toEqual({
		status: "started",
		leaseOwner: "op-1-attempt-2",
		leaseExpiresAt: "2026-04-29T12:00:02.001Z",
		attemptCount: 2,
	});
	database.close();
});

test("stale lease owners cannot complete or fail after takeover", () => {
	const { database, service, setNow } = createService();
	const first = service.begin({ operationId: "op-1", method: "turn/start", payload: { prompt: "one" } });
	if (first.status !== "started") throw new Error("expected first attempt to start");
	setNow("2026-04-29T12:00:01.001Z");
	const second = service.begin({ operationId: "op-1", method: "turn/start", payload: { prompt: "one" } });
	if (second.status !== "started") throw new Error("expected repaired attempt to start");

	expect(() => service.complete("op-1", first.leaseOwner, { ok: false })).toThrow("Operation lease no longer owned");
	expect(() => service.fail("op-1", first.leaseOwner, new Error("old failure"))).toThrow(
		"Operation lease no longer owned",
	);

	service.complete("op-1", second.leaseOwner, { ok: true });
	expect(service.begin({ operationId: "op-1", method: "turn/start", payload: { prompt: "one" } })).toEqual({
		status: "replay",
		result: { ok: true },
	});
	database.close();
});

test("failed operations preserve current rejection semantics", () => {
	const { database, service } = createService();
	const started = service.begin({ operationId: "op-1", method: "turn/start", payload: { prompt: "one" } });
	if (started.status !== "started") throw new Error("expected attempt to start");
	service.fail("op-1", started.leaseOwner, new Error("boom"));

	expect(() => service.begin({ operationId: "op-1", method: "turn/start", payload: { prompt: "one" } })).toThrow(
		"boom",
	);
	expect(() => service.begin({ operationId: "op-1", method: "turn/start", payload: { prompt: "two" } })).toThrow(
		"Operation id conflict",
	);
	database.close();
});
