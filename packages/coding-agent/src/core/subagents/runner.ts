import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { getSubagentArtifactPaths, shouldSpillSubagentContext } from "./artifacts.js";
import { SubagentRegistry } from "./registry.js";
import type { SubmitResultPayload } from "./submit-result-tool.js";
import type { SubagentRunRequest, SubagentRunResult } from "./types.js";

export interface SubagentSessionHandle {
	prompt(text: string): Promise<void>;
	waitForIdle(): Promise<void>;
	abort(): Promise<void>;
	dispose(): void;
}

export interface CreateSubagentSessionOptions {
	childSessionFile: string;
	packetText: string;
	contextArtifactPath?: string;
	request: SubagentRunRequest;
	onSubmit: (payload: SubmitResultPayload) => void;
}

export type CreateSubagentSession = (options: CreateSubagentSessionOptions) => Promise<SubagentSessionHandle>;

export class SubagentRunner {
	#createSession: CreateSubagentSession;
	#registry: SubagentRegistry;

	constructor(input: { createSession: CreateSubagentSession; registry?: SubagentRegistry }) {
		this.#createSession = input.createSession;
		this.#registry = input.registry ?? new SubagentRegistry();
	}

	get registry(): SubagentRegistry {
		return this.#registry;
	}

	async run(request: SubagentRunRequest): Promise<SubagentRunResult> {
		const runId = randomUUID().slice(0, 8);
		const paths = getSubagentArtifactPaths(request.parentSessionFile, runId);
		await fs.mkdir(paths.directory, { recursive: true });

		const packetLines = [
			`Goal: ${request.goal}`,
			"",
			request.assignment,
			request.context ? `\nContext:\n${request.context}` : "",
		].join("\n");

		let contextArtifactPath: string | undefined;
		let packetText = packetLines;

		if (request.context && shouldSpillSubagentContext(packetLines)) {
			await fs.writeFile(paths.contextFile, request.context, "utf8");
			contextArtifactPath = paths.contextFile;
			packetText = [`Goal: ${request.goal}`, "", request.assignment, "", `Context file: ${paths.contextFile}`].join(
				"\n",
			);
		}

		let submitPayload: SubmitResultPayload | undefined;
		const handle = await this.#createSession({
			childSessionFile: paths.sessionFile,
			packetText,
			contextArtifactPath,
			request,
			onSubmit: (payload) => {
				submitPayload = payload;
			},
		});

		this.#registry.start({
			runId,
			agent: request.agent.name,
			summary: request.goal,
			parentSessionFile: request.parentSessionFile,
			childSessionFile: paths.sessionFile,
		});

		try {
			await handle.prompt(packetText);
			await handle.waitForIdle();

			if (!submitPayload) {
				this.#registry.finish(runId, { status: "failed", summary: "Subagent exited without submit_result." });
				return {
					runId,
					agent: request.agent.name,
					status: "failed",
					summary: "Subagent exited without submit_result.",
					childSessionFile: paths.sessionFile,
					contextArtifactPath,
					error: "Subagent exited without submit_result.",
				};
			}

			if (submitPayload.data !== undefined) {
				await fs.writeFile(paths.resultFile, JSON.stringify(submitPayload.data, null, 2), "utf8");
			}

			const status = submitPayload.error ? "failed" : "completed";
			this.#registry.finish(runId, { status, summary: submitPayload.summary });
			return {
				runId,
				agent: request.agent.name,
				status,
				summary: submitPayload.summary,
				childSessionFile: paths.sessionFile,
				contextArtifactPath,
				resultArtifactPath: submitPayload.data !== undefined ? paths.resultFile : undefined,
				data: submitPayload.data,
				error: submitPayload.error,
			};
		} finally {
			handle.dispose();
		}
	}
}
