import { describe, expect, it } from "vitest";
import { SettingsManager } from "../../src/core/settings-manager.js";

describe("tool output settings", () => {
	it("exposes Forge-style default output limits", () => {
		const settings = SettingsManager.inMemory();
		expect(settings.getToolOutputSettings()).toEqual({
			maxStdoutPrefixLines: 100,
			maxStdoutSuffixLines: 100,
			maxFetchChars: 40_000,
		});
	});

	it("allows overriding individual tool output limits", () => {
		const settings = SettingsManager.inMemory({
			toolOutputs: { maxStdoutPrefixLines: 12, maxFetchChars: 9000 },
		});
		expect(settings.getToolOutputSettings()).toEqual({
			maxStdoutPrefixLines: 12,
			maxStdoutSuffixLines: 100,
			maxFetchChars: 9000,
		});
	});
});
