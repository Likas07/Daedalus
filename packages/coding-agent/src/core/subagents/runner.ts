import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import type { AgentSessionEvent } from "../agent-session.js";
import { getSubagentArtifactPaths, shouldSpillSubagentContext } from "./artifacts.js";
import { writePersistedSubagentRun } from "./persisted-runs.js";
import { resolveSubagentPolicy } from "./policy.js";
import { SubagentRegistry } from "./registry.js";
import { validateSubagentResult } from "./result-validation.js";
import type { SubmitResultPayload } from "./submit-result-tool.js";
import type { SubagentRunProgress, SubagentRunRequest, SubagentRunResult } from "./types.js";

const MAX_SUBMIT_REMINDERS = 2;
const SUBMIT_REMINDER = [
	"You must finish by calling submit_result exactly once.",
	"If you succeeded, submit { summary, data }.",
	"If you are blocked, submit { summary, error }.",
].join(" ");

export interface SubagentSessionHandle {
	prompt(text: string): Promise<void>;
	waitForIdle(): Promise<void>;
	abort(): Promise<void>;
	dispose(): void;
	subscribe?(listener: (event: AgentSessionEvent) => void): (() => void) | undefined;
}

export interface CreateSubagentSessionOptions {
	runId: string;
	childSessionFile: string;
	packetText: string;
	contextArtifactPath?: string;
	request: SubagentRunRequest;
	onSubmit: (payload: SubmitResultPayload) => void;
}

export type CreateSubagentSession = (options: CreateSubagentSessionOptions) => Promise<SubagentSessionHandle>;

function truncate(text: string, max = 72): string {
	const clean = text.replace(/\s+/g, " ").trim();
	if (clean.length <= max) return clean;
	return `${clean.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function formatToolActivity(toolName: string, args: Record<string, unknown> | undefined): string {
	switch (toolName) {
		case "read":
			return `read ${String(args?.path ?? args?.file_path ?? "...")}`;
		case "grep":
			return `grep /${String(args?.pattern ?? "")}/ in ${String(args?.path ?? ".")}`;
		case "find":
			return `find ${String(args?.pattern ?? "*")} in ${String(args?.path ?? ".")}`;
		case "ls":
			return `ls ${String(args?.path ?? ".")}`;
		case "bash":
			return `$ ${truncate(String(args?.command ?? ""), 64)}`;
		case "write":
			return `write ${String(args?.path ?? args?.file_path ?? "...")}`;
		case "edit":
			return `edit ${String(args?.path ?? args?.file_path ?? "...")}`;
		case "hashline_edit":
			return `hashline_edit ${String(args?.path ?? "...")}`;
		case "ast_grep":
			return `ast_grep ${truncate(String(args?.pat ?? args?.pattern ?? ""), 48)}`;
		case "ast_edit":
			return `ast_edit ${truncate(String(args?.ops ?? "rewrite"), 48)}`;
		case "submit_result":
			return "submitting result";
		default:
			return truncate(`${toolName} ${JSON.stringify(args ?? {})}`, 72);
	}
}

function pushRecentActivity(recent: string[], activity: string): string[] {
	if (!activity) return recent;
	if (recent[recent.length - 1] === activity) return recent;
	const next = [...recent, activity];
	return next.slice(-4);
}

export class SubagentRunner {
	#createSession: CreateSubagentSession;
	#registry: SubagentRegistry;
	#maxConcurrency: number;
	#maxDepth: number;

	constructor(input: {
		createSession: CreateSubagentSession;
		registry?: SubagentRegistry;
		maxConcurrency?: number;
		maxDepth?: number;
	}) {
		this.#createSession = input.createSession;
		this.#registry = input.registry ?? new SubagentRegistry();
		this.#maxConcurrency = input.maxConcurrency ?? 4;
		this.#maxDepth = input.maxDepth ?? 2;
	}

	get registry(): SubagentRegistry {
		return this.#registry;
	}

	assertCanRun(request: SubagentRunRequest): void {
		const requestedDepth = request.metadata?.depth ?? 1;
		const policy = resolveSubagentPolicy(request.agent, request.policy);
		const effectiveMaxDepth = Math.min(this.#maxDepth, policy.maxDepth ?? this.#maxDepth);

		if (requestedDepth > effectiveMaxDepth) {
			throw new Error(`subagent maxDepth exceeded: ${requestedDepth} > ${effectiveMaxDepth}`);
		}
		if (this.#registry.getActiveRuns().length >= this.#maxConcurrency) {
			throw new Error(`subagent maxConcurrency exceeded: ${this.#maxConcurrency}`);
		}
		if (request.metadata?.parentAgent === request.agent.name) {
			throw new Error(`subagent recursion blocked for ${request.agent.name}`);
		}
	}

	async run(request: SubagentRunRequest): Promise<SubagentRunResult> {
		this.assertCanRun(request);

		const runId = randomUUID().slice(0, 8);
		const startedAt = Date.now();
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
			runId,
			childSessionFile: paths.sessionFile,
			packetText,
			contextArtifactPath,
			request,
			onSubmit: (payload) => {
				submitPayload = payload;
			},
		});

		let recentActivity = [`starting ${request.agent.name}`];
		let lastActivity = recentActivity[0];
		let persistedRun: SubagentRunResult = {
			runId,
			agent: request.agent.name,
			status: "running",
			summary: request.goal,
			goal: request.goal,
			startedAt,
			updatedAt: startedAt,
			activity: lastActivity,
			recentActivity,
			childSessionFile: paths.sessionFile,
			contextArtifactPath,
		};
		let persistQueue = Promise.resolve();
		const queuePersist = (update: Partial<SubagentRunResult>): Promise<void> => {
			persistedRun = {
				...persistedRun,
				...update,
				recentActivity: update.recentActivity ?? persistedRun.recentActivity,
			};
			const snapshot: SubagentRunResult = {
				...persistedRun,
				recentActivity: persistedRun.recentActivity ? [...persistedRun.recentActivity] : undefined,
			};
			persistQueue = persistQueue.then(() => writePersistedSubagentRun(paths.metaFile, snapshot));
			return persistQueue;
		};

		const emitProgress = (activity?: string) => {
			if (activity) {
				recentActivity = pushRecentActivity(recentActivity, activity);
				lastActivity = activity;
			}
			this.#registry.update(runId, {
				summary: request.goal,
				activity,
				recentActivity,
				childSessionFile: paths.sessionFile,
				contextArtifactPath,
			});
			void queuePersist({
				summary: request.goal,
				updatedAt: Date.now(),
				activity: activity ?? lastActivity,
				recentActivity,
				childSessionFile: paths.sessionFile,
				contextArtifactPath,
			});
			const progress: SubagentRunProgress = {
				runId,
				agent: request.agent.name,
				status: "running",
				summary: request.goal,
				childSessionFile: paths.sessionFile,
				contextArtifactPath,
				activity,
				recentActivity,
			};
			request.onProgress?.(progress);
		};

		this.#registry.start({
			runId,
			agent: request.agent.name,
			summary: request.goal,
			activity: recentActivity[0],
			recentActivity,
			parentSessionFile: request.parentSessionFile,
			childSessionFile: paths.sessionFile,
			contextArtifactPath,
			startedAt,
		});
		await queuePersist({});
		emitProgress(recentActivity[0]);

		const unsubscribe = handle.subscribe?.((event) => {
			if (event.type === "message_start") {
				emitProgress("thinking through the task");
				return;
			}
			if (event.type === "tool_execution_start") {
				emitProgress(formatToolActivity(event.toolName, event.args as Record<string, unknown> | undefined));
			}
		});

		try {
			await handle.prompt(packetText);
			for (let attempt = 0; attempt <= MAX_SUBMIT_REMINDERS && !submitPayload; attempt++) {
				await handle.waitForIdle();
				if (submitPayload) break;
				if (attempt < MAX_SUBMIT_REMINDERS) {
					emitProgress("waiting for submit_result");
					await handle.prompt(SUBMIT_REMINDER);
				}
			}

			if (!submitPayload) {
				const updatedAt = Date.now();
				this.#registry.finish(runId, { status: "failed", summary: "Subagent exited without submit_result." });
				await queuePersist({
					status: "failed",
					summary: "Subagent exited without submit_result.",
					updatedAt,
					activity: lastActivity,
					recentActivity,
					error: "Subagent exited without submit_result.",
				});
				return {
					runId,
					agent: request.agent.name,
					status: "failed",
					summary: "Subagent exited without submit_result.",
					goal: request.goal,
					startedAt,
					updatedAt,
					activity: lastActivity,
					recentActivity,
					childSessionFile: paths.sessionFile,
					contextArtifactPath,
					error: "Subagent exited without submit_result.",
				};
			}

			const schemaError = submitPayload.error
				? undefined
				: validateSubagentResult(submitPayload.data, request.outputSchema ?? request.agent.outputSchema);
			if (schemaError) {
				const updatedAt = Date.now();
				this.#registry.finish(runId, {
					status: "failed",
					summary: "Subagent returned invalid structured output.",
				});
				await queuePersist({
					status: "failed",
					summary: "Subagent returned invalid structured output.",
					updatedAt,
					activity: lastActivity,
					recentActivity,
					error: schemaError,
				});
				return {
					runId,
					agent: request.agent.name,
					status: "failed",
					summary: "Subagent returned invalid structured output.",
					goal: request.goal,
					startedAt,
					updatedAt,
					activity: lastActivity,
					recentActivity,
					childSessionFile: paths.sessionFile,
					contextArtifactPath,
					error: schemaError,
				};
			}

			const resultArtifactPath = submitPayload.data !== undefined ? paths.resultFile : undefined;
			if (resultArtifactPath) {
				await fs.writeFile(resultArtifactPath, JSON.stringify(submitPayload.data, null, 2), "utf8");
			}

			const status = submitPayload.error ? "failed" : "completed";
			const updatedAt = Date.now();
			this.#registry.finish(runId, { status, summary: submitPayload.summary });
			await queuePersist({
				status,
				summary: submitPayload.summary,
				updatedAt,
				activity: lastActivity,
				recentActivity,
				resultArtifactPath,
				error: submitPayload.error,
			});
			return {
				runId,
				agent: request.agent.name,
				status,
				summary: submitPayload.summary,
				goal: request.goal,
				startedAt,
				updatedAt,
				activity: lastActivity,
				recentActivity,
				childSessionFile: paths.sessionFile,
				contextArtifactPath,
				resultArtifactPath,
				data: submitPayload.data,
				error: submitPayload.error,
			};
		} finally {
			unsubscribe?.();
			await persistQueue.catch(() => {});
			handle.dispose();
		}
	}
}
