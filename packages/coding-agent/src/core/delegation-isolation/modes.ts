import type {
	DelegationIsolationModeInput,
	DelegationIsolationModeResolution,
	DisplayedDelegationIsolationMode,
} from "./types";

const DISPLAYED_MODES = new Set<DisplayedDelegationIsolationMode>([
	"none",
	"auto",
	"apfs",
	"btrfs",
	"zfs",
	"reflink",
	"overlayfs",
	"projfs",
	"block-clone",
	"rcopy",
]);

const LEGACY_ALIASES: Record<string, DisplayedDelegationIsolationMode> = {
	worktree: "rcopy",
	"fuse-overlay": "overlayfs",
	"fuse-projfs": "projfs",
};

export function parseDelegationIsolationMode(mode: string | undefined): DelegationIsolationModeResolution {
	const requestedMode = (mode ?? "auto") as DelegationIsolationModeInput;
	const displayedMode = LEGACY_ALIASES[requestedMode] ?? requestedMode;
	if (!DISPLAYED_MODES.has(displayedMode as DisplayedDelegationIsolationMode)) {
		throw new Error(`Unsupported delegation isolation mode: ${mode}`);
	}
	if (displayedMode === "none") {
		return { requestedMode, displayedMode, backend: "none" };
	}
	if (displayedMode === "rcopy") {
		return { requestedMode, displayedMode, backend: "rcopy" };
	}
	return {
		requestedMode,
		displayedMode,
		backend: "rcopy",
		fallback: {
			from: displayedMode,
			to: "rcopy",
			reason: "Native transient isolation backends are not implemented yet; using rcopy/git-worktree.",
		},
	};
}
