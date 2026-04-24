import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processFileArguments } from "../../src/cli/file-processor.js";
import { FileChangeDetector } from "../../src/core/tools/file-change-detector.js";
import { ReadLedger } from "../../src/core/tools/read-ledger.js";

function sha256(text: string): string {
	return createHash("sha256").update(Buffer.from(text)).digest("hex");
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
	const dir = join(tmpdir(), `daedalus-attachment-tracking-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await mkdir(dir, { recursive: true });
	try {
		return await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

describe("attachments tracked as reads", () => {
	it("reports @file ingestion metadata usable by the read ledger", async () => {
		await withTempDir(async (dir) => {
			const file = join(dir, "attached.txt");
			await writeFile(file, "original attachment");

			const processed = await processFileArguments([file]);
			const ledger = new ReadLedger(dir);
			for (const readFile of processed.readFiles) {
				ledger.markRead(readFile.path, readFile.contentHash);
			}

			expect(processed.readFiles).toEqual([{ path: file, contentHash: sha256("original attachment") }]);
			await writeFile(file, "externally changed");
			const changes = await new FileChangeDetector().detect(ledger);
			expect(changes).toEqual([{ path: file, currentHash: sha256("externally changed") }]);
		});
	});
});
