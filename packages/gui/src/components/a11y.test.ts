import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const componentRoot = join(import.meta.dir);

function source(file: string): string {
	return readFileSync(join(componentRoot, file), "utf8");
}

describe("GUI accessibility and ownership hardening", () => {
	test("child shell components use callbacks instead of mutating parent-owned ui state", () => {
		const projectBar = source("ProjectBar.svelte");
		const emptyState = source("EmptyState.svelte");
		const leftNav = source("LeftNav.svelte");
		const terminalTail = source("TerminalTail.svelte");

		expect(projectBar).toContain("onViewChange");
		expect(projectBar).toContain("onPaletteOpenChange");
		expect(projectBar).toContain("onLeftOpenChange");
		expect(projectBar).toContain("onRightOpenChange");
		expect(projectBar).not.toContain("ui.view =");
		expect(projectBar).not.toContain("ui.paletteOpen =");
		expect(projectBar).not.toContain("ui.leftOpen =");
		expect(projectBar).not.toContain("ui.rightOpen =");

		expect(emptyState).toContain("onViewChange");
		expect(emptyState).toContain("onPaletteOpenChange");
		expect(emptyState).not.toContain("ui.view =");
		expect(emptyState).not.toContain("ui.paletteOpen =");

		expect(leftNav).toContain("onViewChange");
		expect(leftNav).not.toContain("ui.view = '");

		expect(terminalTail).toContain("onTerminalOpenChange");
		expect(terminalTail).not.toContain("ui.terminalOpen = open");
	});

	test("command palette exposes dialog/listbox semantics and keyboard trap behavior", () => {
		const palette = source("CommandPalette.svelte");
		expect(palette).toContain('role="dialog"');
		expect(palette).toContain('aria-modal="true"');
		expect(palette).toContain('role="combobox"');
		expect(palette).toContain('role="listbox"');
		expect(palette).toContain('role="option"');
		expect(palette).toContain("aria-activedescendant");
		expect(palette).toContain('event.key === "ArrowDown"');
		expect(palette).toContain('event.key === "ArrowUp"');
		expect(palette).toContain('event.key === "Enter"');
		expect(palette).toContain('event.key === "Escape"');
		expect(palette).toContain('event.key === "Tab"');
		expect(palette).toContain("previousFocus");
	});

	test("settings, diff, terminal, and approvals define keyboard-accessible regions", () => {
		const settings = source("SettingsPanel.svelte");
		const diff = source("DiffOverlay.svelte");
		const terminalTabs = source("TerminalTabs.svelte");
		const approvalQueue = source("ApprovalQueue.svelte");

		expect(settings).toContain('role="tablist"');
		expect(settings).toContain('role="tab"');
		expect(settings).toContain('role="tabpanel"');
		expect(settings).toContain('event.key === "ArrowDown"');
		expect(settings).toContain('event.key === "Home"');
		expect(settings).toContain('event.key === "End"');

		expect(diff).toContain('role="dialog"');
		expect(diff).toContain('aria-modal="true"');
		expect(diff).toContain('event.key === "Escape"');
		expect(diff).toContain('event.key === "Tab"');
		expect(diff).toContain("previousFocus");

		expect(terminalTabs).toContain('role="tablist"');
		expect(terminalTabs).toContain('role="tab"');
		expect(terminalTabs).toContain('event.key === "ArrowRight"');
		expect(terminalTabs).toContain('event.key === "ArrowLeft"');

		expect(approvalQueue).toContain("aria-labelledby");
		expect(approvalQueue).toContain('role="list"');
		expect(approvalQueue).toContain('event.key === "Escape"');
		expect(approvalQueue).toContain('event.key === "Enter"');
	});

	test("extension and approval dialogs include accessible labels and close affordances", () => {
		const extensionDialogs = source("ExtensionDialogs.svelte");
		const approvalCard = source("ApprovalCard.svelte");

		expect(extensionDialogs).toContain('role="dialog"');
		expect(extensionDialogs).toContain("aria-labelledby");
		expect(extensionDialogs).toContain('event.key === "Escape"');
		expect(extensionDialogs).toContain('aria-label="Close extension request"');

		expect(approvalCard).toContain('role="listitem"');
		expect(approvalCard).toContain("Approve once");
		expect(approvalCard).toContain("Deny approval");
	});
});
