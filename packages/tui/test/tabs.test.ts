import { describe, it } from "bun:test";
import assert from "node:assert";
import { Tabs } from "../src/components/tabs.js";
import type { Component } from "../src/tui.js";

const testTheme = {
	activeLabel: (text: string) => `[${text}]`,
	inactiveLabel: (text: string) => text,
	divider: (text: string) => text,
	hint: (text: string) => text,
};

class StubComponent implements Component {
	constructor(
		private readonly lines: string[],
		private readonly guard = false,
	) {}

	render(): string[] {
		return this.lines;
	}

	handleInput(): void {}

	capturesTabNavigation?(): boolean {
		return this.guard;
	}

	invalidate(): void {}
}

describe("Tabs", () => {
	it("renders headers and only the active tab content", () => {
		const tabs = new Tabs(
			[
				{ id: "general", label: "General", content: new StubComponent(["general panel"]) },
				{ id: "display", label: "Display", content: new StubComponent(["display panel"]) },
			],
			testTheme,
		);

		const output = tabs.render(80).join("\n");
		assert.match(output, /\[ General \]/);
		assert.match(output, /Display/);
		assert.match(output, /general panel/);
		assert.doesNotMatch(output, /display panel/);
	});

	it("switches tabs on right arrow, tab, and shift+tab", () => {
		const tabs = new Tabs(
			[
				{ id: "general", label: "General", content: new StubComponent(["general"]) },
				{ id: "display", label: "Display", content: new StubComponent(["display"]) },
				{ id: "behavior", label: "Behavior", content: new StubComponent(["behavior"]) },
			],
			testTheme,
		);

		tabs.handleInput("\x1b[C");
		assert.equal(tabs.getSelectedTabId(), "display");
		tabs.handleInput("\t");
		assert.equal(tabs.getSelectedTabId(), "behavior");
		tabs.handleInput("\x1b[Z");
		assert.equal(tabs.getSelectedTabId(), "display");
	});

	it("does not switch tabs while the active child captures tab navigation", () => {
		const tabs = new Tabs(
			[
				{ id: "general", label: "General", content: new StubComponent(["general"], true) },
				{ id: "display", label: "Display", content: new StubComponent(["display"]) },
			],
			testTheme,
		);

		tabs.handleInput("\x1b[C");
		assert.equal(tabs.getSelectedTabId(), "general");
	});
});
