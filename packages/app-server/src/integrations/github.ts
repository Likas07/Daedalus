import { CiAdapter } from "./ci";
import type {
	CommandRunner,
	IntegrationAdapter,
	IntegrationRepository,
	IntegrationState,
	LinkedIssue,
	PullRequestCreateRequest,
	PullRequestCreateResult,
	PullRequestStatus,
} from "./integration-api";

export interface GitHubAdapterOptions {
	readonly runner: CommandRunner;
	readonly cwd?: string;
}

export class GitHubAdapter implements IntegrationAdapter {
	readonly provider = "github" as const;
	private readonly ci: CiAdapter;
	constructor(private readonly options: GitHubAdapterOptions) {
		this.ci = new CiAdapter(options);
	}

	async getState(input: { readonly cwd?: string } = {}): Promise<IntegrationState> {
		const cwd = input.cwd ?? this.options.cwd;
		const [auth, repo, checks] = await Promise.all([
			this.authStatus(cwd),
			this.detectRepository(cwd),
			this.getCiChecks({ cwd }),
		]);
		return {
			provider: this.provider,
			status: auth,
			repository: repo,
			issues: [],
			pullRequests: [],
			ciChecks: checks,
			updatedAt: new Date().toISOString(),
			message: auth === "error" ? "GitHub CLI unavailable or returned an error" : undefined,
		};
	}

	async authStatus(cwd?: string): Promise<IntegrationState["status"]> {
		const result = await this.options.runner(["gh", "auth", "status"], { cwd });
		if (result.exitCode === 0) return "authenticated";
		return /not logged|login|authentication/i.test(`${result.stdout}\n${result.stderr ?? ""}`)
			? "unauthenticated"
			: "error";
	}

	async detectRepository(cwd?: string): Promise<IntegrationRepository | undefined> {
		const result = await this.options.runner(["git", "config", "--get", "remote.origin.url"], { cwd });
		if (result.exitCode !== 0) return undefined;
		return parseGitHubRemote(result.stdout.trim());
	}

	async lookupIssue(input: { readonly id: string; readonly cwd?: string }): Promise<LinkedIssue | undefined> {
		const result = await this.options.runner(["gh", "issue", "view", input.id, "--json", "number,title,url,state"], {
			cwd: input.cwd ?? this.options.cwd,
		});
		if (result.exitCode !== 0) return undefined;
		const row = JSON.parse(result.stdout) as { number?: number; title?: string; url?: string; state?: string };
		return { id: String(row.number ?? input.id), title: row.title, url: row.url, state: row.state };
	}

	async getPullRequestStatus(input: {
		readonly number: number;
		readonly cwd?: string;
	}): Promise<PullRequestStatus | undefined> {
		const result = await this.options.runner(
			["gh", "pr", "view", String(input.number), "--json", "number,title,url,state"],
			{ cwd: input.cwd ?? this.options.cwd },
		);
		if (result.exitCode !== 0) return undefined;
		return JSON.parse(result.stdout) as PullRequestStatus;
	}

	async createPullRequest(
		input: PullRequestCreateRequest & { readonly cwd?: string },
	): Promise<PullRequestCreateResult> {
		const args = ["gh", "pr", "create", "--title", input.title, "--head", input.head, "--json", "number,url"];
		if (input.body) args.push("--body", input.body);
		if (input.base) args.push("--base", input.base);
		if (input.draft) args.push("--draft");
		const result = await this.options.runner(args, { cwd: input.cwd ?? this.options.cwd });
		if (result.exitCode !== 0) return { status: "failed", message: result.stderr ?? result.stdout };
		const row = JSON.parse(result.stdout) as { number?: number; url?: string };
		return { status: "created", number: row.number, url: row.url };
	}

	getCiChecks(input: { readonly ref?: string; readonly cwd?: string } = {}) {
		return this.ci.getChecks(input.ref, input.cwd ?? this.options.cwd);
	}
}

export function parseGitHubRemote(remote: string): IntegrationRepository | undefined {
	const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
	return match ? { owner: match[1]!, name: match[2]!, remoteUrl: remote } : undefined;
}
