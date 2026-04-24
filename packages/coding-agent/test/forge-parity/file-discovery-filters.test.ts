import { describe, expect, it } from "bun:test";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	filterAndResolve,
	isIgnoredByName,
	isSymlink,
} from "../../src/extensions/daedalus/tools/file-discovery-filters.js";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
	const dir = join(tmpdir(), `daedalus-filters-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await mkdir(dir, { recursive: true });
	try {
		return await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

describe("Forge file discovery filters", () => {
	it("ports is_ignored_by_name exact rules", () => {
		for (const name of [
			"package.lock.json",
			"foo.lock",
			"bun.lockb",
			"yarn-lock.yaml",
			"pnpm-lock.yml",
			"composer-lock.json",
			"something.lockfile",
			"Package.resolved",
		]) {
			expect(isIgnoredByName(name)).toBe(true);
		}
		expect(isIgnoredByName("regular.ts")).toBe(false);
	});

	it("detects symlinks without following them", async () => {
		await withTempDir(async (dir) => {
			const real = join(dir, "real.ts");
			const link = join(dir, "link.ts");
			await writeFile(real, "export const real = true;\n");
			await symlink(real, link);
			expect(isSymlink(link)).toBe(true);
			expect(isSymlink(real)).toBe(false);
		});
	});

	it("filterAndResolve applies symlink, ignored-name, and extension filters", async () => {
		await withTempDir(async (dir) => {
			await writeFile(join(dir, "main.ts"), "export const main = true;\n");
			await writeFile(join(dir, "script.py"), "print('ok')\n");
			await writeFile(join(dir, "yarn.lock"), "lock\n");
			await writeFile(join(dir, "tool.exe"), "binary-ish\n");
			await symlink(join(dir, "main.ts"), join(dir, "linked.ts"));
			expect(filterAndResolve(dir, ["main.ts", "linked.ts", "yarn.lock", "tool.exe", "script.py"])).toEqual(
				[join(dir, "main.ts"), join(dir, "script.py")].sort(),
			);
		});
	});
});
