import type { WorkflowChangedFile, WorkflowFileStatus } from "@daedalus-pi/app-server-protocol";
import { type GitStatusSummary, git, gitStatus, riskGroupForPath } from "./git";

export interface DiffFileSummary extends WorkflowChangedFile {}

export interface DiffResult extends GitStatusSummary {
	readonly files: DiffFileSummary[];
	readonly patch: string;
	readonly riskyGroups: readonly string[];
}

export class DiffService {
	async get(cwd: string, base = "HEAD"): Promise<DiffResult> {
		const [nameStatus, patch, numstat, status] = await Promise.all([
			git(cwd, ["diff", "--name-status", base, "--"]),
			git(cwd, ["diff", "--patch", base, "--"]),
			git(cwd, ["diff", "--numstat", base, "--"]),
			gitStatus(cwd),
		]);
		const stats = parseNumstat(numstat.stdout);
		const files: DiffFileSummary[] = parseNameStatus(nameStatus.stdout).map((file) => {
			const stat = stats.get(file.path) ?? { insertions: 0, deletions: 0 };
			return {
				...file,
				insertions: stat.insertions,
				deletions: stat.deletions,
				staged: Boolean(status.files.find((changed) => changed.path === file.path)?.staged),
				riskGroup: riskGroupForPath(file.path),
			};
		});
		return {
			...status,
			files,
			patch: patch.stdout,
			riskyGroups: [...new Set(files.map((file) => file.riskGroup ?? "other"))],
		};
	}
}

export function parseNameStatus(output: string): DiffFileSummary[] {
	return output
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [status, ...paths] = line.split("\t");
			const code = status.startsWith("R") ? "R" : (status[0] ?? "M");
			return {
				status: diffStatusCodeToName(code),
				path: paths.at(-1) ?? "",
				previousPath: status.startsWith("R") ? paths[0] : undefined,
				staged: false,
				insertions: 0,
				deletions: 0,
				riskGroup: "other",
			};
		});
}

function diffStatusCodeToName(code: string): WorkflowFileStatus {
	switch (code) {
		case "A":
			return "added";
		case "D":
			return "deleted";
		case "R":
			return "renamed";
		case "C":
			return "copied";
		default:
			return "modified";
	}
}

export function parseNumstat(output: string): Map<string, { insertions: number; deletions: number }> {
	const stats = new Map<string, { insertions: number; deletions: number }>();
	for (const line of output.split("\n").filter(Boolean)) {
		const [insertions, deletions, ...paths] = line.split("\t");
		stats.set(paths.at(-1) ?? "", {
			insertions: insertions === "-" ? 0 : Number(insertions),
			deletions: deletions === "-" ? 0 : Number(deletions),
		});
	}
	return stats;
}
