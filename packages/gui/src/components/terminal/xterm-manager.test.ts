import { afterEach, describe, expect, test } from "bun:test";
import {
	type FitAddonLike,
	getManagedXterm,
	resetXtermManagerForTests,
	type TerminalLike,
	type XtermAddonLike,
} from "./xterm-manager";

class FakeTerminal implements TerminalLike {
	cols = 80;
	rows = 24;
	writes = "";
	opened = 0;
	disposed = false;
	addons: XtermAddonLike[] = [];
	#handler: (data: string) => void = () => {};
	open(): void {
		this.opened++;
	}
	write(data: string): void {
		this.writes += data;
	}
	clear(): void {
		this.writes = "";
	}
	dispose(): void {
		this.disposed = true;
	}
	onData(handler: (data: string) => void): { dispose(): void } {
		this.#handler = handler;
		return { dispose() {} };
	}
	loadAddon(addon: XtermAddonLike): void {
		this.addons.push(addon);
	}
	emit(data: string): void {
		this.#handler(data);
	}
}
class FakeFitAddon implements FitAddonLike {
	fits = 0;
	fit(): void {
		this.fits++;
	}
}
class FakeAddon implements XtermAddonLike {}

afterEach(() => resetXtermManagerForTests());

describe("xterm manager", () => {
	test("keeps instances, replays delta history, and forwards input", async () => {
		const input: string[] = [];
		const runtime = {
			sendTerminalInput: async (_id: string, data: string) => input.push(data),
			resizeTerminal: async () => {},
		};
		const managed = getManagedXterm("term-1", runtime, { TerminalCtor: FakeTerminal, FitAddonCtor: FakeFitAddon });
		expect(getManagedXterm("term-1", runtime, { TerminalCtor: FakeTerminal, FitAddonCtor: FakeFitAddon })).toBe(
			managed,
		);
		managed.attach({} as HTMLElement);
		managed.replay("hello");
		managed.replay("hello world");
		expect((managed.terminal as FakeTerminal).writes).toBe("hello world");
		(managed.terminal as FakeTerminal).emit("x");
		await Promise.resolve();
		expect(input).toEqual(["x"]);
	});

	test("fit reports current terminal dimensions", async () => {
		const sizes: Array<{ cols: number; rows: number }> = [];
		const runtime = {
			sendTerminalInput: async () => {},
			resizeTerminal: async (_id: string, size: { cols: number; rows: number }) => sizes.push(size),
		};
		const managed = getManagedXterm("term-2", runtime, { TerminalCtor: FakeTerminal, FitAddonCtor: FakeFitAddon });
		managed.fit();
		await Promise.resolve();
		expect(sizes).toEqual([{ cols: 80, rows: 24 }]);
	});

	test("loads fit, search, serialize, and web links addons", () => {
		const runtime = { sendTerminalInput: async () => {}, resizeTerminal: async () => {} };
		const managed = getManagedXterm("term-3", runtime, {
			TerminalCtor: FakeTerminal,
			FitAddonCtor: FakeFitAddon,
			SearchAddonCtor: FakeAddon,
			SerializeAddonCtor: FakeAddon,
			WebLinksAddonCtor: FakeAddon,
		});
		expect((managed.terminal as FakeTerminal).addons).toHaveLength(4);
		expect(managed.searchAddon).toBeInstanceOf(FakeAddon);
		expect(managed.serializeAddon).toBeInstanceOf(FakeAddon);
		expect(managed.webLinksAddon).toBeInstanceOf(FakeAddon);
	});
});
