import { describe, expect, test } from "bun:test";
import { KEYBINDINGS, type Keybinding, KeybindingsManager, type KeyId } from "./keybindings.js";

const historyDefaults = {
	"app.history.pageUp": ["pageUp"],
	"app.history.pageDown": ["pageDown"],
	"app.history.halfPageUp": ["alt+pageUp"],
	"app.history.halfPageDown": ["alt+pageDown"],
	"app.history.top": ["home"],
	"app.history.bottom": ["end"],
	"app.history.previousMessage": ["ctrl+alt+up"],
	"app.history.nextMessage": ["ctrl+alt+down"],
	"app.history.lastUser": ["ctrl+alt+u"],
	"app.history.latestAssistant": ["ctrl+alt+a"],
	"app.history.copyLastAssistant": ["ctrl+alt+c"],
} satisfies Partial<Record<Keybinding, KeyId[]>>;

const escapeHatchDefaults = {
	"app.escape.copyCurrentResponse": [],
	"app.escape.copyLastResponse": [],
	"app.escape.openResponseInEditor": [],
	"app.escape.openTranscriptInEditor": [],
	"app.escape.exportMarkdown": [],
	"app.escape.exportHtml": [],
	"app.escape.exportJsonl": [],
	"app.escape.nativeDump": [],
} satisfies Partial<Record<Keybinding, KeyId[]>>;

describe("app history keybindings", () => {
	test("declares all history actions with default keys", () => {
		const manager = new KeybindingsManager();

		for (const [keybinding, keys] of Object.entries(historyDefaults) as [Keybinding, KeyId[]][]) {
			expect(Object.hasOwn(KEYBINDINGS, keybinding)).toBe(true);
			expect(manager.getKeys(keybinding)).toEqual(keys);
		}
	});

	test("declares escape-hatch actions as configurable app actions", () => {
		const manager = new KeybindingsManager();

		for (const [keybinding, keys] of Object.entries(escapeHatchDefaults) as [Keybinding, KeyId[]][]) {
			expect(Object.hasOwn(KEYBINDINGS, keybinding)).toBe(true);
			expect(manager.getKeys(keybinding)).toEqual(keys);
		}
	});

	test("resolves user overrides for history actions", () => {
		const manager = new KeybindingsManager({
			"app.history.pageUp": "ctrl+u",
			"app.history.pageDown": ["ctrl+d", "ctrl+f"],
			"app.history.copyLastAssistant": [],
		});

		expect(manager.getKeys("app.history.pageUp")).toEqual(["ctrl+u"]);
		expect(manager.getKeys("app.history.pageDown")).toEqual(["ctrl+d", "ctrl+f"]);
		expect(manager.getKeys("app.history.copyLastAssistant")).toEqual([]);
	});

	test("PageUp, PageDown, Home, and End are app-level history actions", () => {
		const manager = new KeybindingsManager();

		expect(manager.getKeys("app.history.pageUp")).toEqual(["pageUp"]);
		expect(manager.getKeys("app.history.pageDown")).toEqual(["pageDown"]);
		expect(manager.getKeys("app.history.top")).toEqual(["home"]);
		expect(manager.getKeys("app.history.bottom")).toEqual(["end"]);
	});
	test("assigns Ctrl+O to reader mode and keeps tool expansion overrideable", () => {
		const manager = new KeybindingsManager();

		expect(manager.getKeys("app.reader.open")).toEqual(["ctrl+o"]);
		expect(manager.getKeys("app.tools.expand")).toEqual(["ctrl+alt+o"]);

		const overridden = new KeybindingsManager({
			"app.tools.expand": "ctrl+o",
			"app.reader.open": "ctrl+r",
		});
		expect(overridden.getKeys("app.tools.expand")).toEqual(["ctrl+o"]);
		expect(overridden.getKeys("app.reader.open")).toEqual(["ctrl+r"]);
	});
});
