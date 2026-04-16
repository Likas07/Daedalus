import { join } from "node:path";

const CONTEXT_SPILL_THRESHOLD_BYTES = 12_000;

export interface SubagentArtifactPaths {
	directory: string;
	sessionFile: string;
	resultFile: string;
	contextFile: string;
}

export function getSubagentArtifactPaths(parentSessionFile: string, runId: string): SubagentArtifactPaths {
	const parentArtifactsRoot = parentSessionFile.replace(/\.jsonl$/, "");
	const directory = join(parentArtifactsRoot, "subagents");
	return {
		directory,
		sessionFile: join(directory, `${runId}.jsonl`),
		resultFile: join(directory, `${runId}.result.json`),
		contextFile: join(directory, `${runId}.context.md`),
	};
}

export function shouldSpillSubagentContext(packetText: string): boolean {
	return Buffer.byteLength(packetText, "utf8") > CONTEXT_SPILL_THRESHOLD_BYTES;
}
