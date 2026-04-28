import { describe, expect, test } from "bun:test";
import type { RendererTerminal } from "../../client/gui-state-types";
import {
	applyTerminalOutput,
	capTerminalHistory,
	removeTerminal,
	selectExistingTerminal,
	terminalCloseLabel,
	terminalEvidenceRow,
	terminalLabel,
	upsertTerminal,
} from "./terminal-state";

const terminal = (terminalId: string, history = "", updatedAt = terminalId): RendererTerminal => ({
	terminalId,
	cwd: `/tmp/${terminalId}`,
	cols: 80,
	rows: 24,
	status: "running",
	history,
	updatedAt,
});

describe("terminal-state", () => {
	test("upserts by terminalId and keeps newest first", () => {
		expect(
			upsertTerminal([terminal("a", "old", "1"), terminal("a", "stale", "0")], terminal("a", "new", "2")),
		).toEqual([terminal("a", "new", "2")]);
		expect(upsertTerminal([terminal("a", "", "1")], terminal("b", "", "2")).map((item) => item.terminalId)).toEqual([
			"b",
			"a",
		]);
	});

	test("labels never include undefined", () => {
		expect(terminalLabel()).toBe("terminal");
		expect(terminalCloseLabel()).toBe("Close terminal terminal");
		expect(terminalCloseLabel(terminal("term-1"))).toBe("Close terminal term-1");
	});

	test("removes and repairs selected terminal", () => {
		const terminals = removeTerminal([terminal("a"), terminal("b")], "a");
		expect(terminals.map((item) => item.terminalId)).toEqual(["b"]);
		expect(selectExistingTerminal(terminals, "a")).toBe("b");
	});

	test("caps history by bytes and lines", () => {
		expect(capTerminalHistory("abcdef", { maxBytes: 3 })).toBe("def");
		expect(capTerminalHistory("1\n2\n3\n4", { maxLines: 2 })).toBe("3\n4");
	});

	test("ignores replayed output at or below cursor", () => {
		const state = { terminalOutput: "one\n", terminalCursor: 1, terminals: [terminal("a", "one\n")] };
		expect(applyTerminalOutput(state, { terminalId: "a", seq: 1, data: "one\n" })).toBe(false);
		expect(applyTerminalOutput(state, { terminalId: "a", seq: 2, data: "two\n" })).toBe(true);
		expect(state.terminals[0]?.history).toBe("one\ntwo\n");
	});
});

test("builds terminal evidence rows with cwd status exit output tail and link", () => {
	const row = terminalEvidenceRow({
		...terminal("a", "one\ntwo\nthree\nfour\n"),
		status: "exited",
		exitCode: 0,
		sessionId: "session-1",
	});
	expect(row.cwd).toBe("/tmp/a");
	expect(row.status).toBe("exited");
	expect(row.exit).toBe("exit 0");
	expect(row.outputTail).toBe("two\nthree\nfour");
	expect(row.link).toBe("session:session-1");
});
