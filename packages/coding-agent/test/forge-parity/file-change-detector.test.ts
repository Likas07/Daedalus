import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileChangeDetector } from "../../src/core/tools/file-change-detector.js";
import { ReadLedger } from "../../src/core/tools/read-ledger.js";

function sha256(text: string): string {
	return createHash("sha256").update(Buffer.from(text)).digest("hex");
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
	const dir = join(tmpdir(), `daedalus-file-change-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await mkdir(dir, { recursive: true });
	try {
		return await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

describe("FileChangeDetector", () => {
	it("returns sorted changed files with current raw content hashes", async () => {
		await withTempDir(async (dir) => {
			const a = join(dir, "a.ts");
			const b = join(dir, "b.ts");
			await writeFile(a, "old a");
			await writeFile(b, "same b");
			const ledger = new ReadLedger(dir);
			ledger.markRead(b, sha256("same b"));
			ledger.markRead(a, sha256("old a"));

			await writeFile(a, "new a");
			const changes = await new FileChangeDetector().detect(ledger, { maxParallelReads: 4 });

			expect(changes).toEqual([{ path: a, currentHash: sha256("new a") }]);
		});
	});

	it("reports unreadable or missing tracked files as changed with undefined currentHash", async () => {
		await withTempDir(async (dir) => {
			const missing = join(dir, "missing.ts");
			const ledger = new ReadLedger(dir);
			ledger.markRead(missing, sha256("previous"));

			const changes = await new FileChangeDetector().detect(ledger, { maxParallelReads: 2 });

			expect(changes).toEqual([{ path: missing }]);
		});
	});
});
