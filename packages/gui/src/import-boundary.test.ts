import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const execFileAsync = promisify(execFile);

test("GUI import boundaries are enforced", async () => {
	const repoRoot = new URL("../../..", import.meta.url).pathname;
	const { stdout, stderr } = await execFileAsync("bun", ["scripts/check-gui-import-boundaries.ts"], {
		cwd: repoRoot,
	});

	expect(stderr).toBe("");
	expect(stdout.trim()).toBe("GUI import boundaries OK");
});
