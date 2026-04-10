import { CustomEditor, type ExtensionAPI } from "@daedalus-pi/coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@daedalus-pi/tui";

const NORMAL_KEYS: Record<string, string | null> = {
	h: "\x1b[D",
	j: "\x1b[B",
	k: "\x1b[A",
	l: "\x1b[C",
	"0": "\x01",
	$: "\x05",
	x: "\x1b[3~",
	i: null,
	a: null,
};

class ModalEditor extends CustomEditor {
	private mode: "normal" | "insert" = "insert";

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			if (this.mode === "insert") {
				this.mode = "normal";
			} else {
				super.handleInput(data);
			}
			return;
		}

		if (this.mode === "insert") {
			super.handleInput(data);
			return;
		}

		if (data in NORMAL_KEYS) {
			const seq = NORMAL_KEYS[data];
			if (data === "i") {
				this.mode = "insert";
			} else if (data === "a") {
				this.mode = "insert";
				super.handleInput("\x1b[C");
			} else if (seq) {
				super.handleInput(seq);
			}
			return;
		}

		if (data.length === 1 && data.charCodeAt(0) >= 32) return;
		super.handleInput(data);
	}

	render(width: number): string[] {
		const lines = super.render(width);
		if (lines.length === 0) return lines;

		const label = this.mode === "normal" ? " NORMAL " : " INSERT ";
		const last = lines.length - 1;
		const lastLine = lines[last];
		if (!lastLine) return lines;
		if (visibleWidth(lastLine) >= label.length) {
			lines[last] = truncateToWidth(lastLine, width - label.length, "") + label;
		}
		return lines;
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setEditorComponent((tui, theme, kb) => new ModalEditor(tui, theme, kb));
	});
}
