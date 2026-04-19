import { basename, dirname, join } from "node:path";

export interface SubagentSessionLink {
	childSessionFile?: string;
	metaArtifactPath?: string;
	parentSessionFile?: string;
}

export function deriveMetaArtifactPath(childSessionFile?: string): string | undefined {
	if (!childSessionFile) return undefined;
	const dir = dirname(childSessionFile);
	const stem = basename(childSessionFile, ".jsonl");
	return join(dir, `${stem}.meta.json`);
}

export function createSubagentSessionLink(input: {
	childSessionFile?: string;
	parentSessionFile?: string;
}): SubagentSessionLink {
	return {
		childSessionFile: input.childSessionFile,
		parentSessionFile: input.parentSessionFile,
		metaArtifactPath: deriveMetaArtifactPath(input.childSessionFile),
	};
}
