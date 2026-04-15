import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getIntentStatsPath } from "../../../../config.js";
import { normalizeIntentStatsFile } from "./aggregate.js";
import type { IntentStatsFile } from "./types.js";

export function readIntentStatsFile(path = getIntentStatsPath()): IntentStatsFile {
	if (!existsSync(path)) {
		return normalizeIntentStatsFile(undefined);
	}

	try {
		const content = readFileSync(path, "utf-8");
		return normalizeIntentStatsFile(JSON.parse(content) as IntentStatsFile);
	} catch {
		return normalizeIntentStatsFile(undefined);
	}
}

export function writeIntentStatsFile(statsFile: IntentStatsFile, path = getIntentStatsPath()): void {
	const dir = dirname(path);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	const tempPath = `${path}.tmp`;
	writeFileSync(tempPath, `${JSON.stringify(statsFile, null, 2)}\n`, "utf-8");
	renameSync(tempPath, path);
}
