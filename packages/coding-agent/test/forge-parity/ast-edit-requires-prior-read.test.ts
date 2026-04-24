import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AstBackend, AstBackendRequest } from "../../src/core/tools/ast/types.js";
import { createAstEditToolDefinition } from "../../src/core/tools/ast-edit.js";
import { ReadLedger } from "../../src/core/tools/read-ledger.js";

function matchFor(request: AstBackendRequest) {
	return {
		file: join(request.cwd, request.paths[0] ?? "a.ts"),
		text: "foo",
		lines: "foo",
		replacement: "bar",
		range: {
			byteOffset: { start: 0, end: 3 },
			start: { line: 1, column: 1 },
			end: { line: 1, column: 4 },
		},
	};
}

function backend(): AstBackend {
	return {
		async run(request: AstBackendRequest) {
			return { stderr: "", matches: [matchFor(request)] };
		},
	};
}

function externallyChangingBackend(originalFile: string): AstBackend {
	return {
		async run(request: AstBackendRequest) {
			await writeFile(originalFile, "external\n", "utf-8");
			return { stderr: "", matches: [matchFor(request)] };
		},
	};
}

describe("ast_edit read-before-edit enforcement", () => {
	it("blocks changed files that were not read and succeeds once marked read", async () => {
		const dir = await mkdtemp(join(tmpdir(), "read-ledger-ast-"));
		const file = join(dir, "a.ts");
		await writeFile(file, "foo\n", "utf-8");
		const ledger = new ReadLedger(dir);
		const tool = createAstEditToolDefinition(dir, { backend: backend(), readLedger: ledger });

		const blocked = await tool.execute(
			"tc",
			{ path: "a.ts", ops: [{ pat: "foo", out: "bar" }] },
			undefined,
			undefined,
			undefined as any,
		);
		expect(blocked.isError).toBe(true);
		expect(blocked.content[0].text).toBe("You must read the file with the read tool before attempting to ast_edit.");
		expect(await readFile(file, "utf-8")).toBe("foo\n");

		ledger.markRead(file);
		const ok = await tool.execute(
			"tc",
			{ path: "a.ts", ops: [{ pat: "foo", out: "bar" }] },
			undefined,
			undefined,
			undefined as any,
		);
		expect(ok.isError).not.toBe(true);
		expect(await readFile(file, "utf-8")).toBe("bar\n");
	});

	it("blocks stale final writes when the source file changes after the ast_edit snapshot", async () => {
		const dir = await mkdtemp(join(tmpdir(), "read-ledger-ast-stale-"));
		const file = join(dir, "a.ts");
		await writeFile(file, "foo\n", "utf-8");
		const ledger = new ReadLedger(dir);
		ledger.markRead(file);
		const tool = createAstEditToolDefinition(dir, {
			backend: externallyChangingBackend(file),
			readLedger: ledger,
		});

		const result = await tool.execute(
			"tc",
			{ path: "a.ts", ops: [{ pat: "foo", out: "bar" }] },
			undefined,
			undefined,
			undefined as any,
		);

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toBe(
			"ast_edit aborted because the file changed after ast_edit read its snapshot. Reread the file and retry ast_edit.",
		);
		expect(await readFile(file, "utf-8")).toBe("external\n");
	});
});
