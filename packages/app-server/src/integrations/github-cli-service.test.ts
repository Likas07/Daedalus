import { describe, expect, test } from "bun:test";
import { GitHubCliService } from "./github-cli-service";
import type { CommandRunner } from "./integration-api";

function runnerFor(responses: Record<string, { stdout?: string; stderr?: string; exitCode: number }>): CommandRunner {
	return async (args) => {
		const response = responses[args.join(" ")];
		return response ? { stdout: response.stdout ?? "", stderr: response.stderr, exitCode: response.exitCode } : { stdout: "", stderr: `unexpected ${args.join(" ")}`, exitCode: 1 };
	};
}

describe("GitHubCliService", () => {
	test("returns actionable missing gh status", async () => {
		const service = new GitHubCliService({ runner: runnerFor({ "gh --version": { stderr: "not found", exitCode: 127 } }) });
		expect(await service.status()).toEqual({ status: "not-configured", code: "gh-missing", message: expect.stringContaining("Install gh") });
	});

	test("returns actionable unauthenticated status", async () => {
		const service = new GitHubCliService({ runner: runnerFor({ "gh --version": { stdout: "gh version", exitCode: 0 }, "gh auth status": { stderr: "not logged in", exitCode: 1 } }) });
		expect(await service.status()).toEqual({ status: "unauthenticated", code: "gh-auth", message: "Run `gh auth login` to connect GitHub." });
	});

	test("lists repository issues pull requests and checks", async () => {
		const service = new GitHubCliService({ runner: runnerFor({
			"gh repo view --json owner,name,url": { stdout: JSON.stringify({ owner: { login: "acme" }, name: "app", url: "https://github.com/acme/app" }), exitCode: 0 },
			"gh issue list --limit 25 --json number,title,url,state,labels": { stdout: JSON.stringify([{ number: 3, title: "Bug", url: "https://issue", state: "OPEN", labels: [{ name: "bug" }] }]), exitCode: 0 },
			"gh pr list --limit 25 --json number,title,url,state,headRefName,baseRefName,isDraft": { stdout: JSON.stringify([{ number: 7, title: "Fix", url: "https://pr", state: "OPEN", headRefName: "feature", baseRefName: "main" }]), exitCode: 0 },
			"gh pr checks HEAD --json name,state,link,bucket,description": { stdout: JSON.stringify([{ name: "test", state: "SUCCESS", link: "https://ci", description: "ok" }]), exitCode: 0 },
		}) });
		expect(await service.repository()).toEqual({ owner: "acme", name: "app", remoteUrl: "https://github.com/acme/app" });
		expect(await service.issues()).toEqual([{ id: "3", number: 3, title: "Bug", url: "https://issue", state: "open", labels: ["bug"] }]);
		expect(await service.pullRequests()).toEqual([{ number: 7, title: "Fix", url: "https://pr", state: "open", head: "feature", base: "main", createUpdateGuarded: true }]);
		expect(await service.checks()).toEqual([{ name: "test", status: "success", url: "https://ci", summary: "ok" }]);
	});

	test("creates and opens pull requests with gh", async () => {
		const calls: string[] = [];
		const service = new GitHubCliService({ runner: async (args) => {
			calls.push(args.join(" "));
			if (args[1] === "pr") return { stdout: JSON.stringify({ number: 9, url: "https://pr/9" }), exitCode: 0 };
			if (args[1] === "browse") return { stdout: "", exitCode: 0 };
			return { stdout: "", exitCode: 1 };
		} });
		expect(await service.createPullRequest({ title: "Ship", head: "feature", base: "main", body: "Body" })).toEqual({ status: "created", number: 9, url: "https://pr/9" });
		expect(await service.openPullRequest("https://pr/9")).toBe(true);
		expect(calls).toContain("gh pr create --title Ship --head feature --json number,url --body Body --base main");
		expect(calls).toContain("gh browse https://pr/9");
	});
});
