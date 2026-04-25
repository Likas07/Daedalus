import type { CiCheck, CommandRunner } from "./integration-api";

export interface CiAdapterOptions {
	readonly runner: CommandRunner;
	readonly cwd?: string;
}

export class CiAdapter {
	readonly provider = "ci" as const;
	constructor(private readonly options: CiAdapterOptions) {}

	async getChecks(ref = "HEAD", cwd = this.options.cwd): Promise<readonly CiCheck[]> {
		const result = await this.options.runner(["gh", "pr", "checks", ref, "--json", "name,state,link"], { cwd });
		if (result.exitCode !== 0) return [];
		try {
			const rows = JSON.parse(result.stdout) as Array<{ name?: string; state?: string; link?: string }>;
			return rows.map((row) => ({
				name: row.name ?? "check",
				status: normalizeCheckState(row.state),
				url: row.link,
			}));
		} catch {
			return [];
		}
	}
}

export function normalizeCheckState(state: string | undefined): CiCheck["status"] {
	switch ((state ?? "").toLowerCase()) {
		case "success":
		case "pass":
			return "success";
		case "failure":
		case "fail":
		case "error":
			return "failure";
		case "pending":
		case "queued":
			return "queued";
		case "in_progress":
		case "running":
			return "in_progress";
		case "cancelled":
			return "cancelled";
		default:
			return "unknown";
	}
}
