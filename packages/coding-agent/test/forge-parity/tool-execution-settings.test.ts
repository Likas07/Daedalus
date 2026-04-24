import { describe, expect, it } from "bun:test";
import { SettingsManager } from "../../src/core/settings-manager.js";

describe("tool execution settings", () => {
	it("defaults to Forge-parity normal timeout and infinite subagent timeout", () => {
		const settings = SettingsManager.inMemory();
		expect(settings.getToolExecutionSettings()).toEqual({
			toolTimeoutMs: 300000,
			subagentToolTimeoutMs: undefined,
		});
	});

	it("reads configured normal and subagent tool timeouts", () => {
		const settings = SettingsManager.inMemory({
			toolExecution: {
				toolTimeoutMs: 123,
				subagentToolTimeoutMs: 456,
			},
		});

		expect(settings.getToolExecutionSettings()).toEqual({
			toolTimeoutMs: 123,
			subagentToolTimeoutMs: 456,
		});
	});
});
