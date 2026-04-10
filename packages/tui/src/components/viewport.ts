import type { Component } from "../tui.js";
import { truncateToWidth, visibleWidth } from "../utils.js";

/**
 * Scrollable viewport over another component's rendered lines.
 *
 * The wrapped child renders its full content. Viewport then slices that content
 * to the configured height and exposes imperative scrolling methods.
 */
export class Viewport implements Component {
	private height = 0;
	private scrollOffset = 0;
	private stickyBottom = true;
	private lastContentHeight = 0;
	private showScrollbar = false;

	constructor(
		private child: Component,
		height = 0,
	) {
		this.height = Math.max(0, height);
	}

	setChild(child: Component): void {
		this.child = child;
	}

	setHeight(height: number): void {
		this.height = Math.max(0, height);
	}

	setShowScrollbar(show: boolean): void {
		this.showScrollbar = show;
	}

	getHeight(): number {
		return this.height;
	}

	getContentHeight(): number {
		return this.lastContentHeight;
	}

	getScrollOffset(): number {
		return this.scrollOffset;
	}

	isAtBottom(): boolean {
		return this.scrollOffset >= this.getMaxScrollOffset(this.lastContentHeight);
	}

	isFollowingBottom(): boolean {
		return this.stickyBottom;
	}

	setStickyBottom(sticky: boolean): void {
		this.stickyBottom = sticky;
		if (sticky) {
			this.scrollOffset = this.getMaxScrollOffset(this.lastContentHeight);
		}
	}

	scrollToBottom(): void {
		this.stickyBottom = true;
		this.scrollOffset = this.getMaxScrollOffset(this.lastContentHeight);
	}

	scrollToTop(): void {
		this.stickyBottom = false;
		this.scrollOffset = 0;
	}

	scrollBy(lines: number): void {
		if (lines === 0) return;
		const maxScrollOffset = this.getMaxScrollOffset(this.lastContentHeight);
		const nextOffset = Math.max(0, Math.min(this.scrollOffset + lines, maxScrollOffset));
		this.scrollOffset = nextOffset;
		this.stickyBottom = nextOffset >= maxScrollOffset;
	}

	pageUp(): void {
		this.scrollBy(-Math.max(1, this.height));
	}

	pageDown(): void {
		this.scrollBy(Math.max(1, this.height));
	}

	invalidate(): void {
		this.child.invalidate();
	}

	render(width: number): string[] {
		const scrollbarWidth = this.showScrollbar ? 1 : 0;
		const contentWidth = Math.max(0, width - scrollbarWidth);
		const contentLines = this.child.render(contentWidth);
		this.lastContentHeight = contentLines.length;

		if (this.stickyBottom) {
			this.scrollOffset = this.getMaxScrollOffset(contentLines.length);
		} else {
			this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, this.getMaxScrollOffset(contentLines.length)));
		}

		if (this.height <= 0) {
			return [];
		}

		const start = Math.max(0, Math.min(this.scrollOffset, this.getMaxScrollOffset(contentLines.length)));
		const end = start + this.height;
		const visibleLines = contentLines.slice(start, end);
		while (visibleLines.length < this.height) {
			visibleLines.push("");
		}

		if (!this.showScrollbar) {
			return visibleLines;
		}

		const { thumbStart, thumbEnd } = this.getScrollbarThumbRange();
		return visibleLines.map((line, index) => {
			const content = truncateToWidth(line, contentWidth, "");
			const paddedContent = content + " ".repeat(Math.max(0, contentWidth - visibleWidth(content)));
			const scrollbarChar =
				this.lastContentHeight > this.height ? (index >= thumbStart && index < thumbEnd ? "█" : "│") : " ";
			return `${paddedContent}\x1b[2m${scrollbarChar}\x1b[22m`;
		});
	}

	private getScrollbarThumbRange(): { thumbStart: number; thumbEnd: number } {
		if (this.height <= 0 || this.lastContentHeight <= this.height) {
			return { thumbStart: 0, thumbEnd: 0 };
		}

		const maxScrollOffset = this.getMaxScrollOffset(this.lastContentHeight);
		const thumbHeight = Math.max(1, Math.floor((this.height * this.height) / this.lastContentHeight));
		const maxThumbStart = Math.max(0, this.height - thumbHeight);
		const thumbStart = maxScrollOffset === 0 ? 0 : Math.round((this.scrollOffset / maxScrollOffset) * maxThumbStart);
		return { thumbStart, thumbEnd: thumbStart + thumbHeight };
	}

	private getMaxScrollOffset(contentHeight: number): number {
		return Math.max(0, contentHeight - this.height);
	}
}
