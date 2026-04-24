import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { ReadLedger } from "./read-ledger.js";

export interface FileChange {
	path: string;
	currentHash?: string;
}

export interface FileChangeDetectorOptions {
	maxParallelReads?: number;
}

async function hashFile(path: string): Promise<string | undefined> {
	try {
		const buffer = await readFile(path);
		return createHash("sha256").update(buffer).digest("hex");
	} catch {
		return undefined;
	}
}

export class FileChangeDetector {
	async detect(
		ledger: Pick<ReadLedger, "entries" | "getHash">,
		options: FileChangeDetectorOptions = {},
	): Promise<FileChange[]> {
		const maxParallelReads = Math.max(1, Math.floor(options.maxParallelReads ?? 4));
		const tracked = ledger
			.entries()
			.map((entry) => entry.path)
			.sort((a, b) => a.localeCompare(b));
		const changes: FileChange[] = [];
		let nextIndex = 0;

		async function worker(): Promise<void> {
			while (true) {
				const index = nextIndex++;
				if (index >= tracked.length) return;
				const path = tracked[index];
				const currentHash = await hashFile(path);
				if (currentHash !== ledger.getHash(path)) {
					changes.push({ path, ...(currentHash ? { currentHash } : {}) });
				}
			}
		}

		await Promise.all(Array.from({ length: Math.min(maxParallelReads, tracked.length) }, () => worker()));
		return changes.sort((a, b) => a.path.localeCompare(b.path));
	}
}
