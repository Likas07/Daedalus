import { GitHubCliService } from "./github-cli-service";
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
	private readonly cli: GitHubCliService;
	constructor(private readonly options: GitHubAdapterOptions) {
		this.cli = new GitHubCliService(options);
	}

	async getState(input: { readonly cwd?: string } = {}): Promise<IntegrationState> {
		const cwd = input.cwd ?? this.options.cwd;
		const auth = await this.cli.status(cwd);
		const [repo, issues, pullRequests, checks] = auth.status === "authenticated"
			? await Promise.all([this.detectRepository(cwd), this.cli.issues(cwd), this.cli.pullRequests(cwd), this.getCiChecks({ cwd })])
			: [undefined, [], [], []] as const;
		return {
			provider: this.provider,
			status: auth.status,
			repository: repo ? { provider: this.provider, ...repo } : undefined,
			issues,
			pullRequests,
			ciChecks: checks,
			syncErrors: auth.message ? [{ provider: this.provider, message: auth.message, code: auth.code, retryable: auth.status !== "not-configured", occurredAt: new Date().toISOString() }] : [],
			updatedAt: new Date().toISOString(),
			message: auth.message,
		};
	}

	async authStatus(cwd?: string): Promise<IntegrationState["status"]> {
		return (await this.cli.status(cwd)).status;
	}

	async detectRepository(cwd?: string): Promise<IntegrationRepository | undefined> {
		const repo = await this.cli.repository(cwd);
		if (repo) return repo;
		const result = await this.options.runner(["git", "config", "--get", "remote.origin.url"], { cwd });
		if (result.exitCode !== 0) return undefined;
		return parseGitHubRemote(result.stdout.trim());
	}

	async lookupIssue(input: { readonly id: string; readonly cwd?: string }): Promise<LinkedIssue | undefined> {
		const result = await this.options.runner(["gh", "issue", "view", input.id, "--json", "number,title,url,state,labels"], {
			cwd: input.cwd ?? this.options.cwd,
		});
		if (result.exitCode !== 0) return undefined;
		const row = JSON.parse(result.stdout) as { number?: number; title?: string; url?: string; state?: string; labels?: Array<{ name?: string }> };
		return { id: String(row.number ?? input.id), number: row.number, title: row.title, url: row.url, state: row.state?.toLowerCase(), labels: row.labels?.map((label) => label.name ?? "").filter(Boolean) };
	}

	async getPullRequestStatus(input: {
		readonly number: number;
		readonly cwd?: string;
	}): Promise<PullRequestStatus | undefined> {
		const result = await this.options.runner(
			["gh", "pr", "view", String(input.number), "--json", "number,title,url,state,headRefName,baseRefName"],
			{ cwd: input.cwd ?? this.options.cwd },
		);
		if (result.exitCode !== 0) return undefined;
		const row = JSON.parse(result.stdout) as { number: number; title?: string; url?: string; state?: string; headRefName?: string; baseRefName?: string };
		return { number: row.number, title: row.title, url: row.url, state: row.state?.toLowerCase(), head: row.headRefName, base: row.baseRefName, createUpdateGuarded: true };
	}

	async createPullRequest(
		input: PullRequestCreateRequest & { readonly cwd?: string },
	): Promise<PullRequestCreateResult> {
		return this.cli.createPullRequest(input);
	}

	getCiChecks(input: { readonly ref?: string; readonly cwd?: string } = {}) {
		return this.cli.checks(input.ref, input.cwd ?? this.options.cwd);
	}
}

export function parseGitHubRemote(remote: string): IntegrationRepository | undefined {
	const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
	return match ? { owner: match[1]!, name: match[2]!, remoteUrl: remote } : undefined;
}
