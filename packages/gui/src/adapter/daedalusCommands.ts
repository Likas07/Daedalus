import type { AppServerClient } from "@daedalus-pi/app-server-client";
import { respondToT3Approval } from "./daedalusApprovals";

type RequestParams = Parameters<AppServerClient["request"]>[1];
type ClientCommand = RequestParams & { type?: string; [key: string]: unknown };

export interface DaedalusCommandAdapterOptions {
	readonly confirm?: (message: string) => Promise<boolean>;
	readonly getActiveThreadId?: () => string | null | undefined;
}

function modelFromSelection(selection: unknown): string | undefined {
	if (selection && typeof selection === "object" && "model" in selection) {
		const model = (selection as { model?: unknown }).model;
		return typeof model === "string" && model.length > 0 ? model : undefined;
	}
	return undefined;
}

function draftStateFromCommand(command: ClientCommand): Record<string, unknown> {
	const draftState: Record<string, unknown> = {};
	for (const key of ["titleSeed", "runtimeMode", "interactionMode", "sourceProposedPlan"] as const) {
		if (command[key] !== undefined) draftState[key] = command[key];
	}
	if (command.bootstrap !== undefined) draftState.bootstrap = command.bootstrap;
	return draftState;
}

function promptContextFromTurn(command: ClientCommand) {
	const message = command.message as { text?: unknown; attachments?: unknown } | undefined;
	const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
	const attachmentIds = attachments
		.map((attachment) =>
			attachment && typeof attachment === "object" ? (attachment as { id?: unknown }).id : undefined,
		)
		.filter((id): id is string => typeof id === "string" && id.length > 0);
	const filePaths = attachments
		.flatMap((attachment) => {
			if (!attachment || typeof attachment !== "object") return [];
			const candidate = attachment as { filePath?: unknown; path?: unknown; filePaths?: unknown };
			if (Array.isArray(candidate.filePaths)) return candidate.filePaths;
			return [candidate.filePath ?? candidate.path];
		})
		.filter((path): path is string => typeof path === "string" && path.length > 0);

	return {
		prompt: typeof message?.text === "string" ? message.text : "",
		...(attachmentIds.length > 0 ? { attachmentIds } : {}),
		...(filePaths.length > 0 ? { filePaths } : {}),
		...(modelFromSelection(command.modelSelection) ? { model: modelFromSelection(command.modelSelection) } : {}),
		draftState: draftStateFromCommand(command),
	};
}

function sessionStartTarget(projectId: unknown) {
	return {
		mode: "base-checkout",
		projectId,
		confirmation: { confirmed: true, evidence: "T3 GUI command adapter" },
	};
}

export function createDaedalusCommandAdapter(client: AppServerClient, options: DaedalusCommandAdapterOptions = {}) {
	return async function dispatchCommand(command: RequestParams): Promise<{ sequence: number }> {
		const input = command as ClientCommand;
		switch (input.type) {
			case "thread.create": {
				await client.request("session/start", {
					projectId: input.projectId,
					startTarget: sessionStartTarget(input.projectId),
					...(modelFromSelection(input.modelSelection) ? { model: modelFromSelection(input.modelSelection) } : {}),
					draftState: {
						threadId: input.threadId,
						title: input.title,
						modelSelection: input.modelSelection,
						runtimeMode: input.runtimeMode,
						interactionMode: input.interactionMode,
						branch: input.branch,
						worktreePath: input.worktreePath,
						createdAt: input.createdAt,
					},
				} as never);
				return { sequence: 0 };
			}
			case "thread.turn.start": {
				const context = promptContextFromTurn(input);
				const bootstrap = input.bootstrap as { createThread?: { projectId?: unknown } } | undefined;
				if (bootstrap?.createThread) {
					await client.request("session/start", {
						projectId: bootstrap.createThread.projectId,
						startTarget: sessionStartTarget(bootstrap.createThread.projectId),
						...context,
					} as never);
				} else {
					await client.request("turn/start", { sessionId: input.threadId, ...context } as never);
				}
				return { sequence: 0 };
			}
			case "thread.turn.interrupt": {
				if (typeof input.turnId === "string" && input.turnId.length > 0) {
					await client.request("turn/cancel", { sessionId: input.threadId, turnId: input.turnId } as never);
				} else {
					await client.request("runtime/abort", { sessionId: input.threadId } as never);
				}
				return { sequence: 0 };
			}
			case "thread.meta.update": {
				if (input.title !== undefined)
					await client.request("session/rename", { sessionId: input.threadId, name: input.title } as never);
				return { sequence: 0 };
			}
			case "thread.archive":
			case "thread.unarchive": {
				await client.request("session/archive", {
					sessionId: input.threadId,
					archived: input.type === "thread.archive",
				} as never);
				return { sequence: 0 };
			}
			case "thread.delete": {
				if (options.getActiveThreadId?.() === input.threadId) {
					const confirmed = await options.confirm?.("Delete the active thread? This cannot be undone.");
					if (!confirmed) return { sequence: 0 };
				}
				await client.request("session/delete", { sessionId: input.threadId } as never);
				return { sequence: 0 };
			}
			case "thread.approval.respond": {
				const response = await respondToT3Approval(client, {
					requestId: String(input.requestId ?? ""),
					decision: input.decision as never,
					...(input.hardBlock === true ? { hardBlock: true } : {}),
				});
				if (!response.ok) throw new Error(response.disabledReason);
				return { sequence: 0 };
			}
			case "project.create": {
				await client.request("project/open", {
					projectId: input.projectId,
					path: input.workspaceRoot,
					name: input.title,
				} as never);
				return { sequence: 0 };
			}
			default:
				return client.request("session/start", command as never) as never;
		}
	};
}
