import { describe, expect, test } from "bun:test";
import { openAppServerDatabase, runMigrations } from "..";
import { GitHubAdapter, parseGitHubRemote } from "./github";
import type { CommandRunner } from "./integration-api";
import { IntegrationService } from "./integration-service";

describe("integration adapter framework", () => {
	test("parses GitHub remotes", () => {
		expect(parseGitHubRemote("git@github.com:daedalus/pi.git")).toEqual({
			owner: "daedalus",
			name: "pi",
			remoteUrl: "git@github.com:daedalus/pi.git",
		});
		expect(parseGitHubRemote("https://github.com/daedalus/pi.git")).toEqual({
			owner: "daedalus",
			name: "pi",
			remoteUrl: "https://github.com/daedalus/pi.git",
		});
	});

	test("builds GitHub state through injected runner only", async () => {
		const calls: string[][] = [];
		const runner: CommandRunner = async (args) => {
			calls.push([...args]);
			if (args.join(" ") === "gh auth status") return { stdout: "Logged in", exitCode: 0 };
			if (args.join(" ") === "git config --get remote.origin.url")
				return { stdout: "git@github.com:acme/project.git\n", exitCode: 0 };
			if (args[0] === "gh" && args[1] === "pr" && args[2] === "checks")
				return { stdout: JSON.stringify([{ name: "test", state: "SUCCESS", link: "https://ci" }]), exitCode: 0 };
			return { stdout: "", stderr: "unexpected", exitCode: 1 };
		};
		const state = await new GitHubAdapter({ runner, cwd: "/repo" }).getState();
		expect(state.status).toBe("authenticated");
		expect(state.repository).toEqual({
			owner: "acme",
			name: "project",
			remoteUrl: "git@github.com:acme/project.git",
		});
		expect(state.ciChecks).toEqual([{ name: "test", status: "success", url: "https://ci" }]);
		expect(calls.every((call) => call[0] === "gh" || call[0] === "git")).toBe(true);
	});

	test("projects integration state to table and event store", async () => {
		const database = openAppServerDatabase(":memory:");
		runMigrations(database);
		const runner: CommandRunner = async (args) => {
			if (args[0] === "gh" && args[1] === "auth") return { stdout: "not logged in", exitCode: 1 };
			return { stdout: "", exitCode: 1 };
		};
		const service = new IntegrationService({ database, runner });
		const states = await service.list({ cwd: "/repo" });
		expect(states[0]?.provider).toBe("github");
		expect(states[0]?.status).toBe("unauthenticated");
		const row = database
			.query<{ provider: string; status: string }, []>("SELECT provider, status FROM integration_states")
			.get();
		expect(row).toEqual({ provider: "github", status: "unauthenticated" });
		const event = database
			.query<{ type: string }, []>("SELECT type FROM runtime_events WHERE type = 'integration/state'")
			.get();
		expect(event?.type).toBe("integration/state");
		database.close();
	});
});
