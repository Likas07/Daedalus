import { describe, expect, it, vi } from "vitest";
import { createSemanticBackgroundSyncController } from "../src/extensions/semantic-search/semantic-background-sync.js";

describe("semantic background sync", () => {
	it("does not start a startup sync for a stale-soft workspace", async () => {
		const sync = vi.fn(async () => {});
		const controller = createSemanticBackgroundSyncController({ syncWorkspace: sync });

		await controller.maybeStartForSession("/repo");
		await controller.maybeStartForSession("/repo");

		expect(sync).not.toHaveBeenCalled();
	});

	it("does not start a turn-end sync for a stale-soft workspace", async () => {
		const sync = vi.fn(async () => {});
		const controller = createSemanticBackgroundSyncController({ syncWorkspace: sync });

		await controller.maybeStartAfterTurn("/repo");
		await controller.maybeStartAfterTurn("/repo");

		expect(sync).not.toHaveBeenCalled();
	});

	it("explicit sync still starts for an already-ready workspace", async () => {
		const sync = vi.fn(async () => {});
		const controller = createSemanticBackgroundSyncController({ syncWorkspace: sync });

		const started = controller.startExplicit("/repo", { restartEmbeddingModel: true });

		expect(started).toBe(true);
		expect(sync).toHaveBeenCalledTimes(1);
		expect(sync).toHaveBeenNthCalledWith(1, "/repo", { restartEmbeddingModel: true });
	});

	it("does not pass restart flags through automatic no-op paths", async () => {
		const sync = vi.fn(async () => {});
		const controller = createSemanticBackgroundSyncController({ syncWorkspace: sync });

		controller.startExplicit("/repo", { restartEmbeddingModel: true });
		controller.maybeStartAfterTurn("/other-repo");
		controller.maybeStartForSession("/another-repo");

		expect(sync).toHaveBeenCalledTimes(1);
		expect(sync).toHaveBeenNthCalledWith(1, "/repo", { restartEmbeddingModel: true });
	});
});
