import { describe, expect, it, vi } from "vitest";
import { getT3FullThreadDiff, getT3TurnDiff } from "./daedalusDiff";

function mockClient(diff: unknown) {
	return {
		request: vi.fn(async () => ({ diff })),
	} as never;
}

describe("daedalusDiff", () => {
	it("maps Daedalus diff/get to a T3 full thread diff", async () => {
		const client = mockClient({ patch: "diff --git a/a.ts b/a.ts", files: [], stagedCount: 0, unstagedCount: 1 });

		await expect(getT3FullThreadDiff(client, { threadId: "thread-1", toTurnCount: 3 })).resolves.toEqual({
			threadId: "thread-1",
			fromTurnCount: 0,
			toTurnCount: 3,
			diff: "diff --git a/a.ts b/a.ts",
		});
		expect(client.request).toHaveBeenCalledWith("diff/get", {
			target: { kind: "session", sessionId: "thread-1" },
		});
	});

	it("returns full diff with degraded status for turn-scoped requests", async () => {
		const client = mockClient({ patch: "full patch" });

		await expect(
			getT3TurnDiff(client, { threadId: "thread-1", fromTurnCount: 1, toTurnCount: 2 }),
		).resolves.toMatchObject({
			threadId: "thread-1",
			fromTurnCount: 1,
			toTurnCount: 2,
			diff: "full patch",
			status: "degraded",
		});
	});
});
