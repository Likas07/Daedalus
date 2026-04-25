import type { SafeCommitInput, StageFilesInput, UnstageFilesInput } from "@daedalus-pi/app-server-protocol";
import type { AppServerClient } from "./client";

export class WorkflowClient {
	constructor(private readonly client: Pick<AppServerClient, "request">) {}

	listWorktrees(projectId: string) {
		return this.client.request("worktree/list", { projectId });
	}

	createWorktree(input: { projectId: string; branch: string; path?: string; baseBranch?: string }) {
		return this.client.request("worktree/create", input);
	}

	listTerminals(filter: { projectId?: string; worktreeId?: string } = {}) {
		return this.client.request("terminal/list", filter);
	}

	attachTerminal(terminalId: string) {
		return this.client.request("terminal/attach", { terminalId });
	}

	detachTerminal(terminalId: string) {
		return this.client.request("terminal/detach", { terminalId });
	}

	killTerminal(terminalId: string) {
		return this.client.request("terminal/kill", { terminalId });
	}

	interruptTerminal(terminalId: string) {
		return this.client.request("terminal/input", { terminalId, data: "\u0003" });
	}

	stage(input: StageFilesInput) {
		return this.client.request("git/stage" as never, input as never);
	}

	unstage(input: UnstageFilesInput) {
		return this.client.request("git/unstage" as never, input as never);
	}

	safeCommit(input: SafeCommitInput) {
		return this.client.request("git/safeCommit" as never, input as never);
	}
}
