import { type Component, truncateToWidth, visibleWidth } from "@daedalus-pi/tui";
import { APP_NAME } from "../../../config.js";
import { theme } from "../theme/theme.js";

export interface RecentSession {
	name: string;
	timeAgo: string;
}

/**
 * Welcome screen with hammer logo and two-column layout.
 * Inspired by OhMyPi's WelcomeComponent, adapted for Daedalus aesthetics.
 */
export class WelcomeComponent implements Component {
	private recentSessions: RecentSession[];

	constructor(
		private readonly version: string,
		private modelName: string,
		private providerName: string,
		private extensionCount: number,
		recentSessions: RecentSession[] = [],
	) {
		this.recentSessions = recentSessions;
	}

	invalidate(): void {}

	setModel(modelName: string, providerName: string): void {
		this.modelName = modelName;
		this.providerName = providerName;
	}

	setRecentSessions(sessions: RecentSession[]): void {
		this.recentSessions = sessions;
	}

	render(termWidth: number): string[] {
		const maxWidth = 90;
		const boxWidth = Math.min(maxWidth, Math.max(0, termWidth - 2));
		if (boxWidth < 4) {
			return [];
		}

		const dualContentWidth = boxWidth - 3; // 3 = │ + │ + │
		const preferredLeftCol = 26;
		const minLeftCol = 22;
		const minRightCol = 20;

		const desiredLeftCol = Math.min(preferredLeftCol, Math.max(minLeftCol, Math.floor(dualContentWidth * 0.35)));
		const dualLeftCol =
			dualContentWidth >= minRightCol + 1
				? Math.min(desiredLeftCol, dualContentWidth - minRightCol)
				: Math.max(1, dualContentWidth - 1);
		const dualRightCol = Math.max(1, dualContentWidth - dualLeftCol);
		const showRightColumn = dualLeftCol >= minLeftCol && dualRightCol >= minRightCol;
		const leftCol = showRightColumn ? dualLeftCol : boxWidth - 2;
		const rightCol = showRightColumn ? dualRightCol : 0;

		// Hammer logo — block characters with gold gradient
		const hammerArt = [
			"  ▄██████████████▄  ",
			"  ██████████████████",
			"  ▀██████████████▀  ",
			"        ████        ",
			"        ████        ",
			"        ████        ",
			"        ████        ",
			"       ▄████▄       ",
		];

		const logoColored = hammerArt.map((line, i) => this.#hammerLine(line, i < 3));

		// Left column — centered content
		const leftLines = [
			"",
			...logoColored.map((l) => this.#centerText(l, leftCol)),
			"",
			this.#centerText(theme.fg("muted", this.modelName), leftCol),
			this.#centerText(theme.fg("dim", this.providerName), leftCol),
		];

		// Right column separator
		const separatorWidth = Math.max(0, rightCol - 2);
		const separator = ` ${theme.fg("borderMuted", "\u2500".repeat(separatorWidth))}`;

		// Big DAEDALUS title
		const titleArt = [
			` ${theme.bold(theme.fg("accent", "D A E D A L U S"))}`,
			` ${theme.fg("dim", "Welcome, craftsman.")}`,
		];

		// Tips
		const tips = [
			"",
			` ${theme.bold(theme.fg("accent", "Tips"))}`,
			` ${theme.fg("dim", "?")} ${theme.fg("muted", "keyboard shortcuts")}`,
			` ${theme.fg("dim", "/")} ${theme.fg("muted", "commands")}`,
			` ${theme.fg("dim", "!")} ${theme.fg("muted", "run bash")}`,
			` ${theme.fg("dim", "@")} ${theme.fg("muted", "attach files")}`,
		];

		// Extensions
		const extSection = [
			separator,
			` ${theme.bold(theme.fg("accent", "Extensions"))}`,
			` ${theme.fg("muted", `${this.extensionCount} extensions active`)}`,
			"",
		];

		const rightLines = ["", ...titleArt, ...tips, ...extSection];

		// Box drawing — gold borders
		const hChar = "\u2500";
		const h = theme.fg("border", hChar);
		const v = theme.fg("border", "\u2502");
		const tl = theme.fg("border", "\u256d");
		const tr = theme.fg("border", "\u256e");
		const bl = theme.fg("border", "\u2570");
		const br = theme.fg("border", "\u256f");

		const lines: string[] = [];

		// Top border with embedded title
		const title = ` ${APP_NAME} v${this.version} `;
		const titlePrefixRaw = hChar.repeat(3);
		const titleStyled = theme.fg("border", titlePrefixRaw) + theme.fg("dim", title);
		const titleVisLen = visibleWidth(titlePrefixRaw) + visibleWidth(title);
		const titleSpace = boxWidth - 2;
		if (titleVisLen >= titleSpace) {
			lines.push(tl + truncateToWidth(titleStyled, titleSpace) + tr);
		} else {
			const afterTitle = titleSpace - titleVisLen;
			lines.push(tl + titleStyled + theme.fg("border", hChar.repeat(afterTitle)) + tr);
		}

		// Content rows
		const maxRows = showRightColumn ? Math.max(leftLines.length, rightLines.length) : leftLines.length;
		for (let i = 0; i < maxRows; i++) {
			const left = this.#fitToWidth(leftLines[i] ?? "", leftCol);
			if (showRightColumn) {
				const right = this.#fitToWidth(rightLines[i] ?? "", rightCol);
				lines.push(v + left + v + right + v);
			} else {
				lines.push(v + left + v);
			}
		}

		// Bottom border
		if (showRightColumn) {
			lines.push(bl + h.repeat(leftCol) + theme.fg("border", "\u2534") + h.repeat(rightCol) + br);
		} else {
			lines.push(bl + h.repeat(leftCol) + br);
		}

		return lines;
	}

	/** Center text within a given width */
	#centerText(text: string, width: number): string {
		const visLen = visibleWidth(text);
		if (visLen >= width) {
			return truncateToWidth(text, width);
		}
		const leftPad = Math.floor((width - visLen) / 2);
		const rightPad = width - visLen - leftPad;
		return " ".repeat(leftPad) + text + " ".repeat(rightPad);
	}

	/** Apply gradient to a hammer line — gold for head, cyan for handle */
	#hammerLine(line: string, isHead: boolean): string {
		const goldColors = [
			"\x1b[38;2;232;200;48m", // bright #E8C830
			"\x1b[38;2;220;185;15m",
			"\x1b[38;2;212;170;0m", // gold #D4AA00
			"\x1b[38;2;185;148;0m",
			"\x1b[38;2;144;112;16m", // dark gold #907010
		];
		const handleColors = [
			"\x1b[38;2;160;125;20m", // medium dark gold
			"\x1b[38;2;144;112;16m", // #907010
			"\x1b[38;2;125;96;12m",
			"\x1b[38;2;108;82;10m",
			"\x1b[38;2;90;68;8m", // deep burnished gold
		];
		const colors = isHead ? goldColors : handleColors;
		const reset = "\x1b[0m";

		let result = "";
		let colorIdx = 0;
		const step = Math.max(1, Math.floor(line.length / colors.length));

		for (let i = 0; i < line.length; i++) {
			if (i > 0 && i % step === 0 && colorIdx < colors.length - 1) {
				colorIdx++;
			}
			const char = line[i];
			if (char !== " ") {
				result += colors[colorIdx] + char + reset;
			} else {
				result += char;
			}
		}
		return result;
	}

	/** Fit string to exact width with ANSI-aware truncation/padding */
	#fitToWidth(str: string, width: number): string {
		const visLen = visibleWidth(str);
		if (visLen > width) {
			return truncateToWidth(str, width, "\u2026");
		}
		return str + " ".repeat(width - visLen);
	}
}
