import type { RendererTerminal } from "../../client/gui-state-types";

export const TERMINAL_HISTORY_MAX_BYTES = 256 * 1024;
export const TERMINAL_HISTORY_MAX_LINES = 5000;

export interface TerminalOutputState {
	terminalOutput: string;
	terminalCursor: number;
	activeTerminalId?: string;
	terminals: RendererTerminal[];
}

export function terminalLabel(terminal?: Pick<RendererTerminal, "terminalId" | "cwd">): string {
	if (!terminal) return "terminal";
	const cwd = terminal.cwd.trim();
	return cwd.split("/").filter(Boolean).at(-1) ?? cwd ?? terminal.terminalId;
}

export function terminalCloseLabel(terminal?: Pick<RendererTerminal, "terminalId" | "cwd">): string {
	return `Close terminal ${terminalLabel(terminal)}`;
}

export function capTerminalHistory(history: string, options: { maxBytes?: number; maxLines?: number } = {}): string {
	const maxBytes = options.maxBytes ?? TERMINAL_HISTORY_MAX_BYTES;
	const maxLines = options.maxLines ?? TERMINAL_HISTORY_MAX_LINES;
	let capped = history;
	if (capped.length > maxBytes) capped = capped.slice(capped.length - maxBytes);
	const lines = capped.split("\n");
	if (lines.length > maxLines) capped = lines.slice(lines.length - maxLines).join("\n");
	return capped;
}

export function upsertTerminal<T extends { terminalId: string; updatedAt?: string }>(
	terminals: readonly T[],
	terminal: T,
): T[] {
	const byId = new Map<string, T>();
	for (const item of terminals) byId.set(item.terminalId, item);
	byId.set(terminal.terminalId, terminal);
	return [...byId.values()].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export function removeTerminal<T extends { terminalId: string }>(terminals: readonly T[], terminalId?: string): T[] {
	if (!terminalId) return [...terminals];
	return terminals.filter((terminal) => terminal.terminalId !== terminalId);
}

export function selectExistingTerminal(
	terminals: readonly RendererTerminal[],
	selectedId?: string,
): string | undefined {
	return terminals.some((terminal) => terminal.terminalId === selectedId) ? selectedId : terminals[0]?.terminalId;
}

export function applyTerminalOutput(
	state: TerminalOutputState,
	params: { terminalId: string; seq: number; data: string },
): boolean {
	const terminal = state.terminals.find((item) => item.terminalId === params.terminalId);
	if (!terminal) return false;
	state.activeTerminalId = params.terminalId;
	if (params.seq <= state.terminalCursor) return false;
	state.terminalOutput = capTerminalHistory(state.terminalOutput + params.data);
	state.terminalCursor = params.seq;
	terminal.history = capTerminalHistory(terminal.history + params.data);
	return true;
}
