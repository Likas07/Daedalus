import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("gui-components package contract", () => {
	test("exposes its component entrypoint through package exports", async () => {
		const packageRoot = new URL("../", import.meta.url);
		const manifest = JSON.parse(await readFile(new URL("package.json", packageRoot), "utf8"));
		const entrypoint = await readFile(new URL("src/index.ts", packageRoot), "utf8");

		expect(manifest.exports["."].import).toBe("./src/index.ts");
		expect(entrypoint).toContain('export * from "./shell/ShellFrame";');
		expect(entrypoint).toContain('export * from "./shell/ThreadSidebar";');
		expect(entrypoint).toContain('export * from "./approval/ApprovalCard";');
		expect(entrypoint).toContain('export * from "./approval/ApprovalQueue";');
		expect(entrypoint).toContain('export * from "./diff/DiffFileView";');
		expect(entrypoint).toContain('export * from "./diff/DiffPanel";');
		expect(entrypoint).toContain('export * from "./terminal/TerminalDrawer";');
		expect(entrypoint).toContain('export * from "./terminal/TerminalPane";');
		expect(entrypoint).toContain('export * from "./thread/Composer";');
		expect(entrypoint).toContain('export * from "./thread/ThreadWorkspace";');
		expect(entrypoint).toContain('export * from "./ui";');
	});
});
