import { copyToClipboard } from "../../utils/clipboard.js";

export type SelectionCopyTui = {
	setSelectionCopyHandler(handler: ((text: string) => void) | undefined): void;
};

export type SelectionCopyStatus = {
	showStatus(message: string): void;
	showError(message: string): void;
};

export async function copySelectedText(text: string): Promise<boolean> {
	if (text.trim().length === 0) {
		return false;
	}

	await copyToClipboard(text);
	return true;
}

export function wireSelectionCopy(tui: SelectionCopyTui, status: SelectionCopyStatus): void {
	tui.setSelectionCopyHandler((text) => {
		void (async () => {
			try {
				await copySelectedText(text);
			} catch (error) {
				status.showError(error instanceof Error ? error.message : String(error));
			}
		})();
	});
}
