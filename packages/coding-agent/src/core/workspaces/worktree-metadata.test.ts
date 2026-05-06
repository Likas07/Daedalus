import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createWorktreeMetadata,
	parseWorktreeMetadata,
	readWorktreeMetadata,
	worktreeMetadataPath,
	writeWorktreeMetadata,
} from "./worktree-metadata.js";

describe("worktree metadata", () => {
	test("creates and round-trips metadata", () => {
		const dir = mkdtempSync(join(tmpdir(), "daedalus-worktree-metadata-"));
		try {
			const metadata = createWorktreeMetadata({
				branch: "agent/task-2",
				baseRef: "main",
				baseCommit: "0123456789012345678901234567890123456789",
				mergeTarget: "main",
				now: new Date("2026-01-02T03:04:05.000Z"),
			});

			expect(metadata).toEqual({
				version: 1,
				branch: "agent/task-2",
				baseRef: "main",
				baseCommit: "0123456789012345678901234567890123456789",
				mergeTarget: "main",
				setup: { status: "created", updatedAt: "2026-01-02T03:04:05.000Z" },
				createdAt: "2026-01-02T03:04:05.000Z",
			});
			expect(writeWorktreeMetadata(dir, metadata)).toBe(worktreeMetadataPath(dir));
			expect(readWorktreeMetadata(dir)).toEqual(metadata);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("validates required schema fields", () => {
		expect(() => parseWorktreeMetadata({ version: 2 })).toThrow(/unsupported version/);
		expect(() =>
			parseWorktreeMetadata({
				version: 1,
				branch: "agent/task-2",
				baseRef: "main",
				baseCommit: "0123456789012345678901234567890123456789",
				setup: { status: "unknown", updatedAt: "2026-01-02T03:04:05.000Z" },
				createdAt: "2026-01-02T03:04:05.000Z",
			}),
		).toThrow(/setup.status/);
	});
});
