export interface CompactHashlineDiffPreview {
	preview: string;
	addedLines: number;
	removedLines: number;
}

export interface CompactHashlineDiffOptions {
	maxOutputLines?: number;
	maxAdditionRun?: number;
	maxDeletionRun?: number;
	maxUnchangedRun?: number;
}

export function buildCompactHashlineDiffPreview(
	diff: string,
	options: CompactHashlineDiffOptions = {},
): CompactHashlineDiffPreview {
	const maxOutputLines = options.maxOutputLines ?? 16;
	const maxAdditionRun = options.maxAdditionRun ?? 3;
	const maxDeletionRun = options.maxDeletionRun ?? 3;
	const maxUnchangedRun = options.maxUnchangedRun ?? 2;
	const lines = diff.length === 0 ? [] : diff.split("\n");
	let addedLines = 0;
	let removedLines = 0;
	let additionRun = 0;
	let deletionRun = 0;
	let unchangedRun = 0;
	let collapsed = 0;
	const output: string[] = [];

	for (const line of lines) {
		const kind = line.startsWith("+") && !line.startsWith("+++") ? "+" : line.startsWith("-") && !line.startsWith("---") ? "-" : " ";
		if (kind === "+") addedLines++;
		if (kind === "-") removedLines++;

		if (kind === "+") {
			additionRun++;
			deletionRun = 0;
			unchangedRun = 0;
			if (additionRun > maxAdditionRun) {
				collapsed++;
				continue;
			}
		} else if (kind === "-") {
			deletionRun++;
			additionRun = 0;
			unchangedRun = 0;
			if (deletionRun > maxDeletionRun) {
				collapsed++;
				continue;
			}
		} else {
			unchangedRun++;
			additionRun = 0;
			deletionRun = 0;
			if (unchangedRun > maxUnchangedRun) {
				collapsed++;
				continue;
			}
		}
		output.push(line);
	}

	const hiddenByLineCap = Math.max(0, output.length - maxOutputLines);
	const capped = hiddenByLineCap > 0 ? output.slice(0, maxOutputLines) : output;
	const hidden = collapsed + hiddenByLineCap;
	if (hidden > 0) capped.push(`... ${hidden} more preview lines`);
	return { preview: capped.join("\n"), addedLines, removedLines };
}
