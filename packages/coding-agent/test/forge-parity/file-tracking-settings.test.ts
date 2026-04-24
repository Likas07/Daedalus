import { describe, expect, it } from "bun:test";
import { SettingsManager } from "../../src/core/settings-manager.js";

describe("fileTracking settings", () => {
	it("defaults maxParallelFileReads to 4", () => {
		expect(SettingsManager.inMemory().getFileTrackingSettings()).toEqual({ maxParallelFileReads: 4 });
	});

	it("allows overriding maxParallelFileReads", () => {
		const settings = SettingsManager.inMemory({ fileTracking: { maxParallelFileReads: 9 } });
		expect(settings.getFileTrackingSettings()).toEqual({ maxParallelFileReads: 9 });
	});
});
