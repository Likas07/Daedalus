import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { daedalusXtermTheme } from "./xterm-theme";

export interface XtermRuntime {
	sendTerminalInput(terminalId: string, data: string): Promise<unknown>;
	resizeTerminal(terminalId: string, size: { cols: number; rows: number }): Promise<unknown>;
}

export interface ManagedXterm {
	readonly terminalId: string;
	terminal: TerminalLike;
	fitAddon: FitAddonLike;
	searchAddon: XtermAddonLike;
	serializeAddon: XtermAddonLike;
	webLinksAddon: XtermAddonLike;
	attach(container: HTMLElement): void;
	detach(): void;
	write(data: string): void;
	fit(): void;
	dispose(): void;
}

export interface TerminalLike {
	cols: number;
	rows: number;
	open(container: HTMLElement): void;
	write(data: string): void;
	clear?(): void;
	dispose(): void;
	onData(handler: (data: string) => void): { dispose(): void };
	loadAddon?(addon: XtermAddonLike): void;
}
export interface XtermAddonLike { dispose?(): void }
export interface FitAddonLike extends XtermAddonLike { fit(): void }
interface ManagerDeps {
	TerminalCtor?: new (options: Record<string, unknown>) => TerminalLike;
	FitAddonCtor?: new () => FitAddonLike;
	SearchAddonCtor?: new () => XtermAddonLike;
	SerializeAddonCtor?: new () => XtermAddonLike;
	WebLinksAddonCtor?: new () => XtermAddonLike;
}

const instances = new Map<string, Managed>();

class Managed implements ManagedXterm {
	terminal: TerminalLike;
	fitAddon: FitAddonLike;
	searchAddon: XtermAddonLike;
	serializeAddon: XtermAddonLike;
	webLinksAddon: XtermAddonLike;
	#container?: HTMLElement;
	#dataDisposable?: { dispose(): void };
	#lastHistory = "";
	constructor(readonly terminalId: string, readonly runtime: XtermRuntime, deps: Required<ManagerDeps>) {
		this.terminal = new deps.TerminalCtor({
			convertEol: true,
			cursorBlink: true,
			fontFamily: '"JetBrains Mono", ui-monospace, monospace',
			fontSize: 12,
			lineHeight: 1.25,
			theme: daedalusXtermTheme,
		});
		this.fitAddon = new deps.FitAddonCtor();
		this.searchAddon = new deps.SearchAddonCtor();
		this.serializeAddon = new deps.SerializeAddonCtor();
		this.webLinksAddon = new deps.WebLinksAddonCtor();
		this.terminal.loadAddon?.(this.fitAddon);
		this.terminal.loadAddon?.(this.searchAddon);
		this.terminal.loadAddon?.(this.serializeAddon);
		this.terminal.loadAddon?.(this.webLinksAddon);
		this.#dataDisposable = this.terminal.onData((data) => void this.runtime.sendTerminalInput(this.terminalId, data));
	}
	attach(container: HTMLElement): void {
		if (this.#container === container) return;
		this.#container = container;
		this.terminal.open(container);
		this.fit();
	}
	detach(): void { this.#container = undefined; }
	write(data: string): void { if (data) this.terminal.write(data); }
	replay(history: string): void {
		if (history === this.#lastHistory) return;
		const delta = history.startsWith(this.#lastHistory) ? history.slice(this.#lastHistory.length) : history;
		if (!history.startsWith(this.#lastHistory)) this.terminal.clear?.();
		this.write(delta);
		this.#lastHistory = history;
	}
	fit(): void {
		this.fitAddon.fit();
		void this.runtime.resizeTerminal(this.terminalId, { cols: this.terminal.cols, rows: this.terminal.rows });
	}
	dispose(): void { this.#dataDisposable?.dispose(); this.terminal.dispose(); instances.delete(this.terminalId); }
}

export function getManagedXterm(terminalId: string, runtime: XtermRuntime, deps: ManagerDeps = {}): ManagedXterm & { replay(history: string): void } {
	const existing = instances.get(terminalId);
	if (existing) return existing;
	const managed = new Managed(terminalId, runtime, {
		TerminalCtor: (deps.TerminalCtor ?? Terminal) as new (options: Record<string, unknown>) => TerminalLike,
		FitAddonCtor: (deps.FitAddonCtor ?? FitAddon) as new () => FitAddonLike,
		SearchAddonCtor: (deps.SearchAddonCtor ?? SearchAddon) as new () => XtermAddonLike,
		SerializeAddonCtor: (deps.SerializeAddonCtor ?? SerializeAddon) as new () => XtermAddonLike,
		WebLinksAddonCtor: (deps.WebLinksAddonCtor ?? WebLinksAddon) as new () => XtermAddonLike,
	});
	instances.set(terminalId, managed);
	return managed;
}

export function disposeManagedXterm(terminalId: string): void { instances.get(terminalId)?.dispose(); }
export function resetXtermManagerForTests(): void { for (const item of [...instances.values()]) item.dispose(); instances.clear(); }
