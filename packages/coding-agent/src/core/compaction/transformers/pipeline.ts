import type { OperationFrame } from "../operation-frame.js";
import { dedupeConsecutiveUsers, dropSystem } from "./drop-dedupe.js";
import { stripWorkingDir } from "./strip-cwd.js";
import { trimContextSummary } from "./trim.js";

export function runSummaryPipeline(frame: OperationFrame, cwd = frame.cwd): OperationFrame {
	return stripWorkingDir(trimContextSummary(dedupeConsecutiveUsers(dropSystem(frame))), cwd);
}
