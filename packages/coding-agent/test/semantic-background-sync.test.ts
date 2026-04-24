import { describe, expect, it, vi } from "vitest";
import {
	BACKGROUND_SYNC_COOLDOWN_MS,
	createSemanticBackgroundSyncController,
} from "../src/extensions/daedalus/tools/semantic-background-sync.js";

describe("semantic background sync", () => {
	it("queues one startup sync per workspace session", async () => {
		const sync = vi.fn(async () => {});
		const getStatus = vi.fn(() => ({ state: "stale_soft", initialized: true, ready: true }));
		const controller = createSemanticBackgroundSyncController({ syncWorkspace: sync, getStatus });

		await controller.maybeStartForSession("/repo");
		await controller.maybeStartForSession("/repo");

		expect(sync).toHaveBeenCalledTimes(1);
	});

	it("suppresses turn-end sync attempts inside the cooldown window", async () => {
		vi.useFakeTimers();
		try {
			const sync = vi.fn(async () => {});
			const getStatus = vi.fn(() => ({ state: "stale_soft", initialized: true, ready: true }));
			const controller = createSemanticBackgroundSyncController({ syncWorkspace: sync, getStatus });

			await controller.maybeStartAfterTurn("/repo");
			await controller.maybeStartAfterTurn("/repo");
			expect(sync).toHaveBeenCalledTimes(1);

			vi.advanceTimersByTime(BACKGROUND_SYNC_COOLDOWN_MS + 1);
			await controller.maybeStartAfterTurn("/repo");
			expect(sync).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not sync uninitialized or hard-stale workspaces", async () => {
		const sync = vi.fn(async () => {});
		const controller = createSemanticBackgroundSyncController({
			syncWorkspace: sync,
			getStatus: () => ({ state: "stale_hard", initialized: true, ready: false }),
		});

		await controller.maybeStartForSession("/repo");
		await controller.maybeStartAfterTurn("/repo");
		expect(sync).not.toHaveBeenCalled();
	});
});
