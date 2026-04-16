import assert from "node:assert";
import { describe, it } from "node:test";
import { KeybindingsManager, TUI_KEYBINDINGS } from "../src/keybindings.js";

describe("KeybindingsManager", () => {
	it("does not evict selector confirm when input submit is rebound", () => {
		const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, {
			"tui.input.submit": ["enter", "ctrl+enter"],
		});

		assert.deepStrictEqual(keybindings.getKeys("tui.input.submit"), ["enter", "ctrl+enter"]);
		assert.deepStrictEqual(keybindings.getKeys("tui.select.confirm"), ["enter"]);
	});

	it("does not evict cursor bindings when another action reuses the same key", () => {
		const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, {
			"tui.select.up": ["up", "ctrl+p"],
		});

		assert.deepStrictEqual(keybindings.getKeys("tui.select.up"), ["up", "ctrl+p"]);
		assert.deepStrictEqual(keybindings.getKeys("tui.editor.cursorUp"), ["up"]);
	});

	it("still reports direct user binding conflicts without evicting defaults", () => {
		const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, {
			"tui.input.submit": "ctrl+x",
			"tui.select.confirm": "ctrl+x",
		});

		assert.deepStrictEqual(keybindings.getConflicts(), [
			{
				key: "ctrl+x",
				keybindings: ["tui.input.submit", "tui.select.confirm"],
			},
		]);
		assert.deepStrictEqual(keybindings.getKeys("tui.editor.cursorLeft"), ["left", "ctrl+b"]);
	});
});

it("keeps tab switching separate from input tab", () => {
	const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, {
		"tui.input.tab": ["tab", "ctrl+i"],
	});

	assert.deepStrictEqual(keybindings.getKeys("tui.input.tab"), ["tab", "ctrl+i"]);
	assert.deepStrictEqual(keybindings.getKeys("tui.tabs.next"), ["tab", "right"]);
});
