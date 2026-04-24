import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import type { AgentSessionEvent } from "../agent-session.js";
import { getSubagentArtifactPaths } from "./artifacts.js";
import { writePersistedSubagentRun } from "./persisted-runs.js";
import { resolveSubagentPolicy } from "./policy.js";
import { SubagentRegistry } from "./registry.js";
import { isSubagentResultEnvelope, validateSubagentEnvelope, validateSubagentResult } from "./result-validation.js";
import type { SubmitResultPayload } from "./submit-result-tool.js";
import { buildTaskPacket } from "./task-packet.js";
import type {
	SubagentEnvelopeStatus,
	SubagentResultEnvelope,
	SubagentResultReference,
	SubagentResultSidecarRecord,
	SubagentRunProgress,
	SubagentRunRequest,
	SubagentRunResult,
	SubagentRunStatus,
} from "./types.js";

const MAX_SUBMIT_REMINDERS = 2;
const SUBMIT_REMINDER = [
	"You must finish by calling submit_result exactly once.",
	"Use the exact envelope { task, status, summary, output }.",
	"Use status=blocked when a dependency prevents completion.",
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

function createResultReference(input: {
	resultId: string;
	agentId: string;
	conversationId: string;
	envelope: SubagentResultEnvelope;
}): SubagentResultReference {
	return {
		resultId: input.resultId,
		agentId: input.agentId,
		conversationId: input.conversationId,
		task: input.envelope.task,
		status: input.envelope.status,
		summary: input.envelope.summary,
		note: `If you want the full output, use read_agent_result_output(${input.resultId}).`,
	};
}

function createSidecarRecord(input: {
	resultId: string;
	agentId: string;
	conversationId: string;
	envelope: SubagentResultEnvelope;
}): SubagentResultSidecarRecord {
	return {
		resultId: input.resultId,
		agentId: input.agentId,
		conversationId: input.conversationId,
		...input.envelope,
	};
}

async function writeResultSidecar(path: string, record: SubagentResultSidecarRecord): Promise<void> {
	await fs.writeFile(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function mapEnvelopeStatus(status: SubagentEnvelopeStatus): Exclude<SubagentRunStatus, "running"> {
	return status;
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
		const resultId = runId;
		const startedAt = Date.now();
		const paths = request.conversationId
			? {
					...getSubagentArtifactPaths(request.parentSessionFile, runId),
					sessionFile: request.conversationId,
				}
			: getSubagentArtifactPaths(request.parentSessionFile, runId);
		await fs.mkdir(paths.directory, { recursive: true });

		const builtPacket = buildTaskPacket({
			goal: request.goal,
			assignment: request.assignment,
			context: request.context,
		});
		let contextArtifactPath: string | undefined;
		let packetText = builtPacket.packetText;

		if (builtPacket.contextToPersist) {
			await fs.writeFile(paths.contextFile, builtPacket.contextToPersist, "utf8");
			contextArtifactPath = paths.contextFile;
			packetText = builtPacket.packetText.replace("{contextArtifactPath}", paths.contextFile);
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
			resultId,
			agent: request.agent.name,
			status: "running",
			summary: request.goal,
			task: request.goal,
			goal: request.goal,
			conversationId: paths.sessionFile,
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
				conversationId: paths.sessionFile,
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
					resultId,
					agent: request.agent.name,
					status: "failed",
					summary: "Subagent exited without submit_result.",
					task: request.goal,
					goal: request.goal,
					conversationId: paths.sessionFile,
					startedAt,
					updatedAt,
					activity: lastActivity,
					recentActivity,
					childSessionFile: paths.sessionFile,
					contextArtifactPath,
					error: "Subagent exited without submit_result.",
				};
			}

			const envelopeError = validateSubagentEnvelope(submitPayload);
			if (envelopeError || !isSubagentResultEnvelope(submitPayload)) {
				const updatedAt = Date.now();
				this.#registry.finish(runId, {
					status: "failed",
					summary: "Subagent returned invalid result envelope.",
				});
				await queuePersist({
					status: "failed",
					summary: "Subagent returned invalid result envelope.",
					updatedAt,
					activity: lastActivity,
					recentActivity,
					error: envelopeError ?? "Invalid subagent result envelope.",
				});
				return {
					runId,
					resultId,
					agent: request.agent.name,
					status: "failed",
					summary: "Subagent returned invalid result envelope.",
					task: request.goal,
					goal: request.goal,
					conversationId: paths.sessionFile,
					startedAt,
					updatedAt,
					activity: lastActivity,
					recentActivity,
					childSessionFile: paths.sessionFile,
					contextArtifactPath,
					error: envelopeError ?? "Invalid subagent result envelope.",
				};
			}

			const structuredOutput = (() => {
				try {
					return JSON.parse(submitPayload.output);
				} catch {
					return submitPayload.output;
				}
			})();
			const schemaError = validateSubagentResult(
				structuredOutput,
				request.outputSchema ?? request.agent.outputSchema,
			);
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
					resultId,
					agent: request.agent.name,
					status: "failed",
					summary: "Subagent returned invalid structured output.",
					task: submitPayload.task,
					goal: request.goal,
					conversationId: paths.sessionFile,
					startedAt,
					updatedAt,
					activity: lastActivity,
					recentActivity,
					childSessionFile: paths.sessionFile,
					contextArtifactPath,
					error: schemaError,
				};
			}

			const sidecar = createSidecarRecord({
				resultId,
				agentId: request.agent.name,
				conversationId: paths.sessionFile,
				envelope: submitPayload,
			});
			await writeResultSidecar(paths.resultFile, sidecar);
			const reference = createResultReference({
				resultId,
				agentId: request.agent.name,
				conversationId: paths.sessionFile,
				envelope: submitPayload,
			});

			const status = mapEnvelopeStatus(submitPayload.status);
			const updatedAt = Date.now();
			this.#registry.finish(runId, { status, summary: submitPayload.summary });
			await queuePersist({
				status,
				summary: submitPayload.summary,
				task: submitPayload.task,
				conversationId: paths.sessionFile,
				output: submitPayload.output,
				reference,
				updatedAt,
				activity: lastActivity,
				recentActivity,
				resultArtifactPath: paths.resultFile,
				data: sidecar,
			});
			return {
				runId,
				resultId,
				agent: request.agent.name,
				status,
				summary: submitPayload.summary,
				task: submitPayload.task,
				goal: request.goal,
				conversationId: paths.sessionFile,
				output: submitPayload.output,
				reference,
				startedAt,
				updatedAt,
				activity: lastActivity,
				recentActivity,
				childSessionFile: paths.sessionFile,
				contextArtifactPath,
				resultArtifactPath: paths.resultFile,
				data: sidecar,
			};
		} finally {
			unsubscribe?.();
			await persistQueue.catch(() => {});
			handle.dispose();
		}
	}
}
