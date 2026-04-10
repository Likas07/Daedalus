import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	type TruncationResult,
	truncateHead,
	withFileMutationQueue,
} from "@daedalus-pi/coding-agent";

export { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead, type TruncationResult };

export async function saveToTempFile(content: string, prefix: string): Promise<string> {
	const tempDir = await mkdtemp(join(tmpdir(), `daedalus-${prefix}-`));
	const tempFile = join(tempDir, "output.txt");
	await withFileMutationQueue(tempFile, async () => {
		await writeFile(tempFile, content, "utf8");
	});
	return tempFile;
}

export function formatTruncationNotice(truncation: TruncationResult, fullOutputPath: string): string {
	const truncatedLines = truncation.totalLines - truncation.outputLines;
	const truncatedBytes = truncation.totalBytes - truncation.outputBytes;
	return (
		`\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines` +
		` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).` +
		` ${truncatedLines} lines (${formatSize(truncatedBytes)}) omitted.` +
		` Full output saved to: ${fullOutputPath}]`
	);
}
