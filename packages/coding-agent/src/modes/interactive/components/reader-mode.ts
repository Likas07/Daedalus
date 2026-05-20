import { type Component, Text, Viewport } from "@daedalus-pi/tui";
import {
	createReaderModel,
	findReaderSearchMatches,
	nextReaderAnchor,
	nextReaderSearchMatch,
	type ReaderMessage,
	type ReaderModel,
} from "../reader-mode-model.js";

export interface ReaderModeActions {
	close?: () => void;
	copy?: (text: string) => void;
	open?: (text: string) => void;
	dump?: (text: string) => void;
	export?: (text: string) => void;
}

export interface ReaderModeOptions {
	title?: string;
	transcript?: string;
	response?: string;
	messages?: ReaderMessage[];
	expandAll?: boolean;
	actions?: ReaderModeActions;
	viewportHeight?: number;
}

export class ReaderModeComponent implements Component {
	private model: ReaderModel;
	private content: Text;
	private viewport: Viewport;
	private searchQuery = "";
	private searchMode = false;
	private status = "";
	private title: string;
	private actions: ReaderModeActions;
	private viewportHeight: number;

	constructor(options: ReaderModeOptions) {
		this.title = options.title ?? "Reader";
		this.actions = options.actions ?? {};
		this.viewportHeight = options.viewportHeight ?? 8;
		this.model = createReaderModel(options);
		this.content = new Text(this.fullText(), 0, 0);
		this.viewport = new Viewport(this.content);
		this.viewport.setShowScrollbar(true);
		this.viewport.scrollToTop();
	}

	getModel(): ReaderModel {
		return this.model;
	}

	getScrollOffset(): number {
		return this.viewport.getScrollOffset();
	}

	invalidate(): void {
		this.content.invalidate();
		this.viewport.invalidate();
	}

	render(width: number): string[] {
		const header = `${this.title} · ${this.model.lines.length} lines${this.model.expandAll ? " · expand all" : ""}`;
		const search = this.searchQuery
			? ` · /${this.searchQuery} (${findReaderSearchMatches(this.model, this.searchQuery).length})`
			: "";
		const footer = this.searchMode
			? `Search: /${this.searchQuery}`
			: `PgUp/PgDn Home/End / n/N h/H m/M a copy open dump export Esc${this.status ? ` · ${this.status}` : ""}`;
		this.viewport.setHeight(this.viewportHeight);
		return [header + search, ...this.viewport.render(width), footer];
	}

	handleInput(data: string): void {
		if (this.searchMode) {
			if (data === "\r" || data === "\n") {
				this.searchMode = false;
				this.jumpToSearch(1);
				return;
			}
			if (data === "\x1b") {
				this.searchMode = false;
				return;
			}
			if (data === "\x7f" || data === "\b") {
				this.searchQuery = this.searchQuery.slice(0, -1);
				return;
			}
			if (data >= " " && data !== "\x7f") this.searchQuery += data;
			return;
		}

		switch (data) {
			case "\x1b[5~":
				this.viewport.pageUp();
				break;
			case "\x1b[6~":
				this.viewport.pageDown();
				break;
			case "\x1b[H":
			case "\x1b[1~":
				this.viewport.scrollToTop();
				break;
			case "\x1b[F":
			case "\x1b[4~":
				this.viewport.scrollToBottom();
				break;
			case "/":
				this.searchMode = true;
				this.searchQuery = "";
				break;
			case "n":
				this.jumpToSearch(1);
				break;
			case "N":
				this.jumpToSearch(-1);
				break;
			case "h":
				this.jumpToAnchor("heading", 1);
				break;
			case "H":
				this.jumpToAnchor("heading", -1);
				break;
			case "m":
				this.jumpToAnchor("message", 1);
				break;
			case "M":
				this.jumpToAnchor("message", -1);
				break;
			case "a":
				this.model = { ...this.model, expandAll: !this.model.expandAll };
				break;
			case "c":
				this.actions.copy?.(this.fullText());
				this.status = "copied";
				break;
			case "o":
				this.actions.open?.(this.fullText());
				this.status = "opened";
				break;
			case "d":
				this.actions.dump?.(this.fullText());
				this.status = "dumped";
				break;
			case "e":
				this.actions.export?.(this.fullText());
				this.status = "exported";
				break;
			case "q":
			case "\x1b":
				this.actions.close?.();
				break;
		}
	}

	private fullText(): string {
		return this.model.lines.map((line) => line.text).join("\n");
	}

	private jumpToSearch(direction: 1 | -1): void {
		const match = nextReaderSearchMatch(
			findReaderSearchMatches(this.model, this.searchQuery),
			this.viewport.getScrollOffset(),
			direction,
		);
		if (match) this.scrollToLine(match.lineIndex);
	}

	private jumpToAnchor(type: "heading" | "message", direction: 1 | -1): void {
		const anchors = type === "heading" ? this.model.headings : this.model.messageAnchors;
		const anchor = nextReaderAnchor(anchors, this.viewport.getScrollOffset(), direction);
		if (anchor) this.scrollToLine(anchor.lineIndex);
	}

	private scrollToLine(lineIndex: number): void {
		this.viewport.scrollToTop();
		this.viewport.scrollBy(lineIndex);
	}
}
