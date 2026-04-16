import type { ThinkingLevel } from "@daedalus-pi/agent-core";
import {
	Container,
	Input,
	type SelectItem,
	SelectList,
	type SelectListLayoutOptions,
	Spacer,
	Text,
} from "@daedalus-pi/tui";
import { getSelectListTheme, theme } from "../theme/theme.js";

export const SETTINGS_SUBMENU_SELECT_LIST_LAYOUT: SelectListLayoutOptions = {
	minPrimaryColumnWidth: 12,
	maxPrimaryColumnWidth: 32,
};

export const THINKING_DESCRIPTIONS: Record<ThinkingLevel, string> = {
	off: "No reasoning",
	minimal: "Very brief reasoning (~1k tokens)",
	low: "Light reasoning (~2k tokens)",
	medium: "Moderate reasoning (~8k tokens)",
	high: "Deep reasoning (~16k tokens)",
	xhigh: "Maximum reasoning (~32k tokens)",
};

export class SelectSubmenu extends Container {
	private readonly selectList: SelectList;

	constructor(
		title: string,
		description: string,
		options: SelectItem[],
		currentValue: string,
		onSelect: (value: string) => void,
		onCancel: () => void,
		onSelectionChange?: (value: string) => void,
	) {
		super();

		this.addChild(new Text(theme.bold(theme.fg("accent", title)), 0, 0));
		if (description) {
			this.addChild(new Spacer(1));
			this.addChild(new Text(theme.fg("muted", description), 0, 0));
		}
		this.addChild(new Spacer(1));

		this.selectList = new SelectList(
			options,
			Math.min(options.length, 10),
			getSelectListTheme(),
			SETTINGS_SUBMENU_SELECT_LIST_LAYOUT,
		);

		const currentIndex = options.findIndex((option) => option.value === currentValue);
		if (currentIndex !== -1) {
			this.selectList.setSelectedIndex(currentIndex);
		}

		this.selectList.onSelect = (item) => onSelect(item.value);
		this.selectList.onCancel = onCancel;
		if (onSelectionChange) {
			this.selectList.onSelectionChange = (item) => onSelectionChange(item.value);
		}

		this.addChild(this.selectList);
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", "  Enter to select · Esc to go back"), 0, 0));
	}

	handleInput(data: string): void {
		this.selectList.handleInput(data);
	}
}

export interface TextInputSubmenuOptions {
	title: string;
	description: string;
	initialValue: string;
	validate?: (value: string) => string | undefined;
	onSubmit: (value: string) => void;
	onCancel: () => void;
}

export class TextInputSubmenu extends Container {
	private readonly input = new Input();
	private readonly errorText = new Text("", 0, 0);

	constructor(options: TextInputSubmenuOptions) {
		super();

		this.addChild(new Text(theme.bold(theme.fg("accent", options.title)), 0, 0));
		if (options.description) {
			this.addChild(new Spacer(1));
			this.addChild(new Text(theme.fg("muted", options.description), 0, 0));
		}
		this.addChild(new Spacer(1));

		this.input.setValue(options.initialValue);
		this.input.focused = true;
		this.input.onSubmit = (value) => {
			const trimmed = value.trim();
			const error = options.validate?.(trimmed);
			if (error) {
				this.errorText.setText(theme.fg("error", error));
				return;
			}
			this.errorText.setText("");
			options.onSubmit(trimmed);
		};
		this.input.onEscape = options.onCancel;
		this.addChild(this.input);
		this.addChild(new Spacer(1));
		this.addChild(this.errorText);
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", "  Enter to save · Esc to go back"), 0, 0));
	}

	handleInput(data: string): void {
		this.input.handleInput(data);
	}
}
