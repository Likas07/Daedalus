import { type AppServerDatabase, appendEvent, type EventPayload } from "..";
import { GitHubAdapter } from "./github";
import {
	type CommandRunner,
	type IntegrationAdapter,
	type IntegrationState,
	integrationStateEvent,
} from "./integration-api";

export interface IntegrationServiceOptions {
	readonly database: AppServerDatabase;
	readonly runner?: CommandRunner;
}

export class IntegrationService {
	private readonly adapters: readonly IntegrationAdapter[];
	constructor(private readonly options: IntegrationServiceOptions) {
		const runner = options.runner ?? defaultCommandRunner;
		this.adapters = [new GitHubAdapter({ runner })];
	}

	async list(input: { readonly cwd?: string } = {}): Promise<readonly IntegrationState[]> {
		const states = await Promise.all(this.adapters.map((adapter) => adapter.getState(input)));
		for (const state of states) this.recordState(state);
		return states;
	}

	async connect(input: { readonly provider: string; readonly cwd?: string }): Promise<IntegrationState> {
		const adapter = this.adapters.find((item) => item.provider === input.provider);
		if (!adapter) throw new Error(`Unknown integration provider: ${input.provider}`);
		const state = await adapter.getState({ cwd: input.cwd });
		this.recordState(state);
		return state;
	}

	async disconnect(input: { readonly provider: string }): Promise<readonly IntegrationState[]> {
		const now = new Date().toISOString();
		this.options.database.query("DELETE FROM integration_states WHERE provider = ?").run(input.provider);
		return [
			{
				provider: input.provider,
				status: "unauthenticated",
				issues: [],
				pullRequests: [],
				ciChecks: [],
				updatedAt: now,
			},
		];
	}

	async linkArtifact(input: {
		readonly provider: string;
		readonly url: string;
		readonly kind?: string;
	}): Promise<IntegrationState> {
		const state = await this.connect({ provider: input.provider });
		const linked = {
			...state,
			message: `Linked ${input.kind ?? "artifact"}: ${input.url}`,
			updatedAt: new Date().toISOString(),
		};
		this.recordState(linked);
		return linked;
	}

	async importArtifacts(input: { readonly provider: string; readonly source: string }): Promise<IntegrationState> {
		const state = await this.connect({ provider: input.provider });
		const imported = {
			...state,
			message: `Imported integration artifacts from ${input.source}`,
			updatedAt: new Date().toISOString(),
		};
		this.recordState(imported);
		return imported;
	}

	private recordState(state: IntegrationState): void {
		const now = state.updatedAt;
		this.options.database
			.query(`
INSERT INTO integration_states (provider, status, data, updated_at) VALUES (?, ?, ?, ?)
ON CONFLICT(provider) DO UPDATE SET status = excluded.status, data = excluded.data, updated_at = excluded.updated_at
`)
			.run(state.provider, state.status, JSON.stringify(state), now);
		const event = integrationStateEvent(state);
		appendEvent(this.options.database, {
			streamId: `integration:${state.provider}`,
			type: event.type,
			payload: event as unknown as EventPayload,
		});
	}
}

export const defaultCommandRunner: CommandRunner = async (args, options) => {
	const proc = Bun.spawn([...args], {
		cwd: options?.cwd,
		stdin: options?.stdin ? "pipe" : undefined,
		stdout: "pipe",
		stderr: "pipe",
	});
	if (options?.stdin && proc.stdin) {
		proc.stdin.write(options.stdin);
		proc.stdin.end();
	}
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { stdout, stderr, exitCode };
};
