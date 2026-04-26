import { describe, expect, test } from "bun:test";
import { GUI_CAPABILITIES, disabledReasonFor, getGuiCapability, isGuiCapabilityEnabled } from "./capability-registry";

describe("GUI capability registry", () => {
	test("requires a disabled reason for every non-wired capability", () => {
		for (const capability of GUI_CAPABILITIES) {
			if (capability.status === "wired") {
				expect(capability.disabledReason).toBeUndefined();
			} else {
				expect(capability.disabledReason?.trim()).toBeTruthy();
			}
		}
	});

	test("covers the Task 1 parity contract surface", () => {
		expect(GUI_CAPABILITIES.map((capability) => capability.id)).toEqual([
			"entrypoints",
			"sessions",
			"turns",
			"transcript",
			"tools",
			"approvals",
			"models",
			"auth",
			"settings",
			"keybindings",
			"slash-commands",
			"extensions",
			"skills",
			"prompts",
			"themes",
			"package-resources",
			"plans",
			"todos",
			"subagents",
			"semantic-search",
			"terminal",
			"diff",
			"git",
			"worktrees",
			"diagnostics",
			"export",
			"reconnect",
			"desktop-native",
		]);
	});

	test("exposes helpers for no-visible-no-op UI wiring", () => {
		expect(isGuiCapabilityEnabled("terminal")).toBe(true);
		expect(disabledReasonFor("keybindings")).toContain("rebinding");
		expect(getGuiCapability("export").status).toBe("disabled");
	});
});
