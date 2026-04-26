export type ShellView = "session" | "settings" | "empty" | "diff";
export type PopoverKind = null | "model" | "effort" | "mode" | "access";
export type PaletteMode = "commands" | "project";

export interface PopoverAnchor {
	readonly left: number;
	readonly right: number;
	readonly top: number;
	readonly bottom: number;
	readonly width: number;
	readonly height: number;
}

export interface UiState {
	view: ShellView;
	paletteOpen: boolean;
	paletteMode: PaletteMode;
	terminalOpen: boolean;
	leftOpen: boolean;
	rightOpen: boolean;
	leftWidth: number;
	rightWidth: number;
	popoverKind: PopoverKind;
	popoverAnchor: PopoverAnchor | null;
	favorites: string[];
	diffPath: string | null;
	compact: boolean;
}

export function createUiState(): UiState {
	const state = $state({
		view: "empty" as ShellView,
		paletteOpen: false,
		paletteMode: "commands" as PaletteMode,
		terminalOpen: false,
		leftOpen: true,
		rightOpen: true,
		leftWidth: 248,
		rightWidth: 328,
		popoverKind: null as PopoverKind,
		popoverAnchor: null as PopoverAnchor | null,
		favorites: [] as string[],
		diffPath: null as string | null,
		compact: false,
	});
	return state;
}
