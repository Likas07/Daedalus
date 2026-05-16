import { describe, expect, test, vi } from "vitest";

const copyToClipboard = vi.fn(async (_text: string) => {});

vi.mock("../src/utils/clipboard.js", () => ({
	copyToClipboard,
}));

describe("selected-text copy", () => {
	test("copies exact selected text while preserving indentation", async () => {
		const { copySelectedText } = await import("../src/modes/interactive/selection-copy.js");
		const text = "  indented code\n\tmore code\n";

		await expect(copySelectedText(text)).resolves.toBe(true);

		expect(copyToClipboard).toHaveBeenCalledWith(text);
	});

	test("ignores whitespace-only selections", async () => {
		const { copySelectedText } = await import("../src/modes/interactive/selection-copy.js");
		copyToClipboard.mockClear();

		await expect(copySelectedText(" \n\t ")).resolves.toBe(false);

		expect(copyToClipboard).not.toHaveBeenCalled();
	});

	test("wires TUI selection copy handler without writing success status", async () => {
		const { wireSelectionCopy } = await import("../src/modes/interactive/selection-copy.js");
		let handler: ((text: string) => void) | undefined;
		const tui = { setSelectionCopyHandler: vi.fn((next: ((text: string) => void) | undefined) => (handler = next)) };
		const status = { showStatus: vi.fn(), showError: vi.fn() };
		copyToClipboard.mockClear();

		wireSelectionCopy(tui, status);
		handler?.("selected");
		await Promise.resolve();
		await Promise.resolve();
		expect(copyToClipboard).toHaveBeenCalledWith("selected");

		expect(tui.setSelectionCopyHandler).toHaveBeenCalledTimes(1);
		expect(status.showStatus).not.toHaveBeenCalled();
		expect(status.showError).not.toHaveBeenCalled();
	});

	test("reports clipboard failures without showing copied status", async () => {
		const { wireSelectionCopy } = await import("../src/modes/interactive/selection-copy.js");
		let handler: ((text: string) => void) | undefined;
		const tui = { setSelectionCopyHandler: vi.fn((next: ((text: string) => void) | undefined) => (handler = next)) };
		const status = { showStatus: vi.fn(), showError: vi.fn() };
		copyToClipboard.mockRejectedValueOnce(new Error("clipboard unavailable"));

		wireSelectionCopy(tui, status);
		handler?.("selected");
		await Promise.resolve();
		await Promise.resolve();

		expect(status.showError).toHaveBeenCalledWith("clipboard unavailable");
		expect(status.showStatus).not.toHaveBeenCalled();
	});
});
