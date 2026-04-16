import { getKeybindings } from "../keybindings.js";
import type { Component } from "../tui.js";
import { truncateToWidth } from "../utils.js";

export interface TabsTheme {
	activeLabel: (text: string) => string;
	inactiveLabel: (text: string) => string;
	divider: (text: string) => string;
	hint: (text: string) => string;
}

export interface TabItem {
	id: string;
	label: string;
	content: Component & { capturesTabNavigation?(): boolean };
}

export class Tabs implements Component {
	private selectedIndex: number;

	constructor(
		private readonly items: TabItem[],
		private readonly theme: TabsTheme,
		initialTabId?: string,
	) {
		const initialIndex = initialTabId ? items.findIndex((item) => item.id === initialTabId) : 0;
		this.selectedIndex = initialIndex >= 0 ? initialIndex : 0;
	}

	getSelectedTabId(): string | undefined {
		return this.items[this.selectedIndex]?.id;
	}

	setSelectedTab(id: string): void {
		const index = this.items.findIndex((item) => item.id === id);
		if (index >= 0) {
			this.selectedIndex = index;
		}
	}

	render(width: number): string[] {
		if (this.items.length === 0) {
			return [this.theme.hint("No tabs configured")];
		}

		const active = this.items[this.selectedIndex] ?? this.items[0];
		if (!active) {
			return [this.theme.hint("No tabs configured")];
		}

		const header = this.items
			.map((item, index) => {
				const label = ` ${item.label} `;
				return index === this.selectedIndex ? this.theme.activeLabel(label) : this.theme.inactiveLabel(label);
			})
			.join(this.theme.divider(" "));

		return [truncateToWidth(header, width), "", ...active.content.render(width)];
	}

	handleInput(data: string): void {
		if (this.items.length === 0) {
			return;
		}

		const active = this.items[this.selectedIndex]?.content;
		const guard = active?.capturesTabNavigation?.() ?? false;
		const keybindings = getKeybindings();
		if (!guard && keybindings.matches(data, "tui.tabs.next")) {
			this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
			return;
		}
		if (!guard && keybindings.matches(data, "tui.tabs.previous")) {
			this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
			return;
		}
		active?.handleInput?.(data);
	}

	invalidate(): void {
		for (const item of this.items) {
			item.content.invalidate?.();
		}
	}
}
