import { describe, expect, it } from "bun:test";
import type { RenderedLine } from "../src/render-metadata.js";
import { type Component, TUI } from "../src/tui.js";
import { VirtualTerminal } from "./virtual-terminal.js";

class MetadataComponent implements Component {
	render(_width: number): string[] {
		return ["hello world"];
	}

	renderWithMetadata(_width: number): RenderedLine[] {
		return [
			{
				text: "hello world",
				noSelect: [false, false, false, false, false, true, false, false, false, false, false],
			},
		];
	}

	invalidate(): void {}
}

async function flushRender(terminal: VirtualTerminal): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 25));
	await terminal.flush();
}

describe("TUI selection rendering", () => {
	it("highlights mouse selection and exposes selected text", async () => {
		const terminal = new VirtualTerminal(20, 4);
		const tui = new TUI(terminal);
		tui.addChild(new MetadataComponent());
		tui.start();
		await flushRender(terminal);

		terminal.sendInput("\x1b[<0;1;1M");
		terminal.sendInput("\x1b[<32;6;1M");
		await flushRender(terminal);

		expect(tui.getSelectedText()).toBe("hello");
		const viewport = terminal.getViewport();
		expect(viewport[0]).toContain("hello world");
		tui.stop();
	});

	it("invokes copy callback on release with noSelect text excluded", async () => {
		const terminal = new VirtualTerminal(20, 4);
		const tui = new TUI(terminal);
		let copied = "";
		tui.setSelectionCopyHandler((text) => {
			copied = text;
		});
		tui.addChild(new MetadataComponent());
		tui.start();
		await flushRender(terminal);

		terminal.sendInput("\x1b[<0;1;1M");
		terminal.sendInput("\x1b[<32;12;1M");
		terminal.sendInput("\x1b[<0;12;1m");
		await flushRender(terminal);

		expect(copied).toBe("helloworld");
		expect(tui.getSelectedText()).toBe("helloworld");
		tui.stop();
	});

	it("does not copy or replace clipboard contents for a bare click", async () => {
		const terminal = new VirtualTerminal(20, 4);
		const tui = new TUI(terminal);
		let copied = "existing clipboard";
		tui.setSelectionCopyHandler((text) => {
			copied = text;
		});
		tui.addChild(new MetadataComponent());
		tui.start();
		await flushRender(terminal);

		terminal.sendInput("\x1b[<0;2;1M");
		terminal.sendInput("\x1b[<0;2;1m");
		await flushRender(terminal);

		expect(copied).toBe("existing clipboard");
		expect(tui.getSelectedText()).toBe("");
		tui.stop();
	});

	it("does not consume wheel mouse events", async () => {
		const terminal = new VirtualTerminal(20, 4);
		const tui = new TUI(terminal);
		let seen = "";
		tui.addInputListener((data) => {
			seen = data;
			return undefined;
		});
		tui.start();
		terminal.sendInput("\x1b[<64;1;1M");
		expect(seen).toBe("\x1b[<64;1;1M");
		tui.stop();
	});
});
