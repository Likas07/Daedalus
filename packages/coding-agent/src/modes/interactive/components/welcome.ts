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
	constructor(
		private readonly version: string,
		private modelName: string,
		private providerName: string,
		private extensionCount: number,
		private recentSessions: RecentSession[] = [],
	) {}

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
		const preferredLeftCol = 24;
		const minLeftCol = 16;
		const minRightCol = 20;

		const desiredLeftCol = Math.min(
			preferredLeftCol,
			Math.max(minLeftCol, Math.floor(dualContentWidth * 0.35)),
		);
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
			" ▄███████▄ ",
			" ████████████",
			"    ▐██▌    ",
			"    ▐██▌    ",
			"    ▐██▌    ",
			"   ▄████▄   ",
		];

		const logoColored = hammerArt.map((line) => this.#gradientLine(line));

		// Left column — centered content
		const leftLines = [
			"",
			this.#centerText(theme.bold("Welcome, craftsman."), leftCol),
			"",
			...logoColored.map((l) => this.#centerText(l, leftCol)),
			"",
			this.#centerText(theme.fg("muted", this.modelName), leftCol),
			this.#centerText(theme.fg("dim", this.providerName), leftCol),
		];

		// Right column separator
		const separatorWidth = Math.max(0, rightCol - 2);
		const separator = ` ${theme.fg("borderMuted", "\u2500".repeat(separatorWidth))}`;

		// Tips
		const tips = [
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
		];

		// Recent sessions
		const sessionLines: string[] = [];
		if (this.recentSessions.length === 0) {
			sessionLines.push(` ${theme.fg("dim", "No recent sessions")}`);
		} else {
			for (const session of this.recentSessions.slice(0, 3)) {
				const bullet = theme.fg("dim", "\u2022 ");
				const name = theme.fg("muted", session.name);
				const ago = theme.fg("dim", ` (${session.timeAgo})`);
				sessionLines.push(` ${bullet}${name}${ago}`);
			}
		}

		const rightLines = [
			...tips,
			...extSection,
			separator,
			` ${theme.bold(theme.fg("accent", "Recent sessions"))}`,
			...sessionLines,
			"",
		];

		// Box drawing
		const hChar = "\u2500";
		const h = theme.fg("borderMuted", hChar);
		const v = theme.fg("borderMuted", "\u2502");
		const tl = theme.fg("borderMuted", "\u256d");
		const tr = theme.fg("borderMuted", "\u256e");
		const bl = theme.fg("borderMuted", "\u2570");
		const br = theme.fg("borderMuted", "\u256f");

		const lines: string[] = [];

		// Top border with embedded title
		const title = ` ${APP_NAME} v${this.version} `;
		const titlePrefixRaw = hChar.repeat(3);
		const titleStyled = theme.fg("borderMuted", titlePrefixRaw) + theme.fg("dim", title);
		const titleVisLen = visibleWidth(titlePrefixRaw) + visibleWidth(title);
		const titleSpace = boxWidth - 2;
		if (titleVisLen >= titleSpace) {
			lines.push(tl + truncateToWidth(titleStyled, titleSpace) + tr);
		} else {
			const afterTitle = titleSpace - titleVisLen;
			lines.push(tl + titleStyled + theme.fg("borderMuted", hChar.repeat(afterTitle)) + tr);
		}

		// Content rows
		const maxRows = showRightColumn
			? Math.max(leftLines.length, rightLines.length)
			: leftLines.length;
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
			lines.push(
				bl +
					h.repeat(leftCol) +
					theme.fg("borderMuted", "\u2534") +
					h.repeat(rightCol) +
					br,
			);
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

	/** Apply gold→bronze gradient to a hammer line */
	#gradientLine(line: string): string {
		const colors = [
			"\x1b[38;2;232;197;71m", // bright gold #E8C547
			"\x1b[38;2;210;178;50m", // gold
			"\x1b[38;2;201;162;39m", // #C9A227
			"\x1b[38;2;170;135;30m", // darker gold
			"\x1b[38;2;139;105;20m", // bronze #8B6914
			"\x1b[38;2;110;85;20m", // dark bronze
		];
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
