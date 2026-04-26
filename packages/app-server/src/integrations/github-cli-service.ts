import { normalizeCheckState } from "./ci";
import type {
	CiCheck,
	CommandRunner,
	IntegrationRepository,
	IntegrationState,
	LinkedIssue,
	PullRequestCreateRequest,
	PullRequestCreateResult,
	PullRequestStatus,
} from "./integration-api";

export interface GitHubCliServiceOptions {
	readonly runner: CommandRunner;
	readonly cwd?: string;
}

export interface GitHubCliStatus {
	readonly status: IntegrationState["status"];
	readonly message?: string;
	readonly code?: string;
}

export class GitHubCliService {
	constructor(private readonly options: GitHubCliServiceOptions) {}

	async status(cwd = this.options.cwd): Promise<GitHubCliStatus> {
		const installed = await this.options.runner(["gh", "--version"], { cwd });
		if (installed.exitCode !== 0) {
			return {
				status: "not-configured",
				code: "gh-missing",
				message: "GitHub CLI is not available. Install gh from https://cli.github.com/ and run `gh auth login`.",
			};
		}
		const auth = await this.options.runner(["gh", "auth", "status"], { cwd });
		if (auth.exitCode === 0) return { status: "authenticated" };
		const output = `${auth.stdout}\n${auth.stderr ?? ""}`;
		if (/not logged|login|authentication|not authenticated/i.test(output)) {
			return { status: "unauthenticated", code: "gh-auth", message: "Run `gh auth login` to connect GitHub." };
		}
		return { status: "error", code: "gh-error", message: output.trim() || "GitHub CLI returned an error." };
	}

	async repository(cwd = this.options.cwd): Promise<IntegrationRepository | undefined> {
		const result = await this.options.runner(["gh", "repo", "view", "--json", "owner,name,url"], { cwd });
		if (result.exitCode !== 0) return undefined;
		const row = parseJson<{ owner?: { login?: string }; name?: string; url?: string }>(result.stdout);
		if (!row?.owner?.login || !row.name) return undefined;
		return { owner: row.owner.login, name: row.name, remoteUrl: row.url };
	}

	async issues(cwd = this.options.cwd): Promise<readonly LinkedIssue[]> {
		const result = await this.options.runner(["gh", "issue", "list", "--limit", "25", "--json", "number,title,url,state,labels"], { cwd });
		if (result.exitCode !== 0) return [];
		const rows = parseJson<Array<{ number?: number; title?: string; url?: string; state?: string; labels?: Array<{ name?: string }> }>>(result.stdout) ?? [];
		return rows.map((row) => ({
			id: String(row.number ?? row.url ?? row.title ?? "issue"),
			number: row.number,
			title: row.title ?? `Issue #${row.number ?? ""}`,
			url: row.url,
			state: normalizeState(row.state),
			labels: row.labels?.map((label) => label.name ?? "").filter(Boolean),
		}));
	}

	async pullRequests(cwd = this.options.cwd): Promise<readonly PullRequestStatus[]> {
		const result = await this.options.runner(["gh", "pr", "list", "--limit", "25", "--json", "number,title,url,state,headRefName,baseRefName,isDraft"], { cwd });
		if (result.exitCode !== 0) return [];
		const rows = parseJson<Array<{ number?: number; title?: string; url?: string; state?: string; headRefName?: string; baseRefName?: string; isDraft?: boolean }>>(result.stdout) ?? [];
		return rows.filter((row) => typeof row.number === "number").map((row) => ({
			number: row.number!,
			title: row.title ?? `PR #${row.number}`,
			url: row.url,
			state: row.isDraft ? "draft" : normalizeState(row.state),
			head: row.headRefName,
			base: row.baseRefName,
			createUpdateGuarded: true,
		}));
	}

	async checks(ref = "HEAD", cwd = this.options.cwd): Promise<readonly CiCheck[]> {
		const result = await this.options.runner(["gh", "pr", "checks", ref, "--json", "name,state,link,bucket,description"], { cwd });
		if (result.exitCode !== 0) return [];
		const rows = parseJson<Array<{ name?: string; state?: string; link?: string; description?: string }>>(result.stdout) ?? [];
		return rows.map((row) => ({ name: row.name ?? "check", status: normalizeCheckState(row.state), url: row.link, summary: row.description }));
	}

	async createPullRequest(input: PullRequestCreateRequest & { readonly cwd?: string }): Promise<PullRequestCreateResult> {
		const args = ["gh", "pr", "create", "--title", input.title, "--head", input.head, "--json", "number,url"];
		if (input.body) args.push("--body", input.body);
		if (input.base) args.push("--base", input.base);
		if (input.draft) args.push("--draft");
		const result = await this.options.runner(args, { cwd: input.cwd ?? this.options.cwd });
		if (result.exitCode !== 0) return { status: "failed", message: result.stderr ?? result.stdout };
		const row = parseJson<{ number?: number; url?: string }>(result.stdout);
		return { status: "created", number: row?.number, url: row?.url };
	}

	async openPullRequest(url: string, cwd = this.options.cwd): Promise<boolean> {
		const result = await this.options.runner(["gh", "browse", url], { cwd });
		return result.exitCode === 0;
	}
}

function parseJson<T>(value: string): T | undefined {
	try { return JSON.parse(value) as T; } catch { return undefined; }
}

function normalizeState(state: string | undefined): string {
	return (state ?? "unknown").toLowerCase();
}
