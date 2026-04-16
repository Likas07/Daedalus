import * as fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { getSubagentArtifactPaths } from "./artifacts.js";
import type { SubagentRunResult } from "./types.js";

export async function writePersistedSubagentRun(metaFile: string, run: SubagentRunResult): Promise<void> {
	await fs.mkdir(dirname(metaFile), { recursive: true });
	await fs.writeFile(metaFile, `${JSON.stringify(run, null, 2)}\n`, "utf8");
}

export async function listPersistedSubagentRuns(parentSessionFile: string | undefined): Promise<SubagentRunResult[]> {
	if (!parentSessionFile) return [];

	const directory = getSubagentArtifactPaths(parentSessionFile, "placeholder").directory;
	const entries = await fs.readdir(directory).catch(() => [] as string[]);
	const metaFiles = entries.filter((entry) => entry.endsWith(".meta.json")).sort();
	const runs = await Promise.all(
		metaFiles.map(async (entry) => {
			const content = await fs.readFile(join(directory, entry), "utf8");
			return JSON.parse(content) as SubagentRunResult;
		}),
	);

	return runs.sort((a, b) => {
		const updatedDiff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
		if (updatedDiff !== 0) return updatedDiff;
		return (b.startedAt ?? 0) - (a.startedAt ?? 0);
	});
}
