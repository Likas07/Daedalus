import type { WorkflowChangedFile, WorkflowFileStatus, WorkflowRiskGroup } from "@daedalus-pi/app-server-protocol";
import { type GitStatusSummary, git, gitStatus, riskGroupForPath } from "./git";

export interface DiffFileSummary extends WorkflowChangedFile {}

export interface DiffResult extends GitStatusSummary {
	readonly files: DiffFileSummary[];
	readonly patch: string;
	readonly riskyGroups: readonly WorkflowRiskGroup[];
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
		const byPath = new Map<string, DiffFileSummary>();
		for (const file of parseNameStatus(nameStatus.stdout)) {
			const stat = stats.get(file.path) ?? { insertions: 0, deletions: 0 };
			byPath.set(file.path, {
				...file,
				insertions: stat.insertions,
				deletions: stat.deletions,
				staged: Boolean(status.files.find((changed) => changed.path === file.path)?.staged),
				riskGroup: riskGroupForPath(file.path),
			});
		}
		for (const file of status.files) {
			if (byPath.has(file.path)) continue;
			byPath.set(file.path, {
				path: file.path,
				status: file.status,
				staged: file.staged,
				insertions: 0,
				deletions: 0,
				riskGroup: riskGroupForPath(file.path),
			});
		}
		const files = [...byPath.values()];
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
