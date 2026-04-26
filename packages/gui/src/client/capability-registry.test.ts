import { describe, expect, test } from "bun:test";
import {
	GUI_CAPABILITIES,
	REQUIRED_GUI_FULL_PARITY_CAPABILITY_IDS,
	assertStrictGuiFullParity,
	disabledReasonFor,
	getGuiCapability,
	isGuiCapabilityEnabled,
	strictGuiParityViolations,
	type GuiCapability,
} from "./capability-registry";

function requiredCapabilities(): readonly GuiCapability[] {
	return GUI_CAPABILITIES.filter((capability) => capability.requirement === "required");
}

function allRequiredWiredFixture(): readonly GuiCapability[] {
	return GUI_CAPABILITIES.map((capability): GuiCapability => {
		if (capability.requirement !== "required") return capability;
		const { disabledReason: _disabledReason, ...wiredCapability } = capability;
		return { ...wiredCapability, status: "wired" };
	});
}

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

	test("makes the strict full-parity surfaces explicit", () => {
		expect(requiredCapabilities().map((capability) => capability.id)).toEqual([
			...REQUIRED_GUI_FULL_PARITY_CAPABILITY_IDS,
		]);
		expect(requiredCapabilities().map((capability) => capability.label)).toEqual([
			"Composer",
			"Project/session",
			"Provider/model/auth",
			"Terminal",
			"Git/diff/checkpoint/PR",
			"Settings",
			"Persistence",
			"Workflow/inspector",
			"Desktop-native behavior",
			"E2E",
		]);
	});

	test("requires behavioral coverage references for every required surface", () => {
		for (const capability of requiredCapabilities()) {
			expect(capability.coverage?.behavioral.length, capability.id).toBeGreaterThan(0);
			expect(
				capability.coverage?.behavioral.every((reference) => reference.endsWith(".test.ts")),
				capability.id,
			).toBe(true);
		}
	});

	test("strict full-parity validator rejects partial required surfaces and non-behavioral coverage", () => {
		const allWired = allRequiredWiredFixture();
		expect(strictGuiParityViolations(allWired)).toEqual([]);
		expect(() => assertStrictGuiFullParity(allWired)).not.toThrow();

		const partialComposer = allWired.map(
			(capability): GuiCapability =>
				capability.id === "composer"
					? { ...capability, status: "partial", disabledReason: "Composer behavior is still incomplete." }
					: capability,
		);
		expect(strictGuiParityViolations(partialComposer)).toContainEqual(
			expect.objectContaining({
				capabilityId: "composer",
				kind: "required-status",
			}),
		);

		const sourceOnlyCoverage = allWired.map(
			(capability): GuiCapability =>
				capability.id === "workflow-inspector"
					? { ...capability, coverage: { behavioral: ["packages/gui/src/components/InspectorPanel.svelte"] } }
					: capability,
		);
		expect(strictGuiParityViolations(sourceOnlyCoverage)).toContainEqual(
			expect.objectContaining({
				capabilityId: "workflow-inspector",
				kind: "non-behavioral-coverage",
			}),
		);
	});

	test("current required status blockers are reported by the full gate, not treated as passing parity", () => {
		const incompleteRequiredIds = requiredCapabilities()
			.filter((capability) => capability.status !== "wired")
			.map((capability) => capability.id);
		const strictStatusBlockers = strictGuiParityViolations()
			.filter((violation) => violation.kind === "required-status")
			.map((violation) => violation.capabilityId);
		expect(strictStatusBlockers).toEqual(incompleteRequiredIds);

		if (incompleteRequiredIds.length > 0) {
			expect(() => assertStrictGuiFullParity()).toThrow("Strict GUI full parity gate failed");
		} else {
			expect(() => assertStrictGuiFullParity()).not.toThrow();
		}
	});

	test("exposes helpers for no-visible-no-op UI wiring", () => {
		expect(isGuiCapabilityEnabled("terminal")).toBe(true);
		expect(disabledReasonFor("keybindings")).toContain("rebinding");
		expect(getGuiCapability("export").status).toBe("disabled");
	});
});
