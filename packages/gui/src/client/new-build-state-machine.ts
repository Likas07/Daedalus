import type {
	SessionStartParams,
	SessionStartResult,
	WorkflowRunsInTarget,
	WorkflowWorktreeMetadata,
	WorktreeCreateOutcome,
	WorktreeCreateResult,
} from "@daedalus-pi/app-server-protocol";

export type NewBuildRecoveryAction = "repair" | "locate" | "archive";

export type NewBuildState =
	| { kind: "draft"; prompt: string }
	| { kind: "derivingTarget"; prompt: string }
	| { kind: "creatingWorktree"; prompt: string; branchPreview: string; pathPreview?: string }
	| { kind: "verifyingWorktree"; prompt: string; worktree: WorkflowWorktreeMetadata }
	| { kind: "readyToStart"; prompt: string; worktree: WorkflowWorktreeMetadata }
	| { kind: "startingSession"; prompt: string; startTarget: NonNullable<SessionStartParams["startTarget"]> }
	| { kind: "running"; prompt: string; sessionId: string; runsIn?: WorkflowRunsInTarget }
	| {
			kind: "setupFailed";
			prompt: string;
			message: string;
			retryAction: "retry" | "edit-branch" | "cancel";
			outcome?: WorktreeCreateOutcome;
	  }
	| { kind: "needsAttention"; prompt: string; message: string; recoveryActions: NewBuildRecoveryAction[] }
	| { kind: "baseCheckoutConfirming"; prompt: string; path: string; branch: string; dirtyCount: number }
	| { kind: "cancelingSetup"; prompt: string }
	| { kind: "setupCanceled"; prompt: string }
	| { kind: "partialWorktreeCreated"; prompt: string; worktree: WorkflowWorktreeMetadata; message: string };

export interface NewBuildStartInput {
	readonly projectId: string;
	readonly prompt: string;
	readonly attachmentIds?: readonly string[];
	readonly filePaths?: readonly string[];
	readonly model?: string;
	readonly effort?: string;
	readonly accessMode?: SessionStartParams["accessMode"];
	readonly mode?: string;
	readonly fastMode?: boolean;
	readonly draftState?: SessionStartParams["draftState"];
	readonly target?:
		| {
				readonly mode?: "isolated-worktree";
				readonly worktreeId?: string;
				readonly branch?: string;
				readonly path?: string;
		  }
		| {
				readonly mode: "base-checkout";
				readonly confirmed?: boolean;
				readonly path: string;
				readonly branch: string;
				readonly dirtyCount?: number;
		  };
}

export interface NewBuildStateMachineDependencies {
	readonly createWorktree: (input: {
		projectId: string;
		branch: string;
		path?: string;
		operationId?: string;
	}) => Promise<WorkflowWorktreeMetadata | WorktreeCreateResult>;
	readonly listWorktrees?: (projectId: string) => Promise<readonly WorkflowWorktreeMetadata[]>;
	readonly startSession: (params: SessionStartParams) => Promise<SessionStartResult>;
	readonly nextOperationId?: () => string;
	readonly onState?: (state: NewBuildState) => void;
}

export interface NewBuildStateMachine {
	readonly state: NewBuildState;
	start(input: NewBuildStartInput): Promise<SessionStartResult | undefined>;
	confirmBaseCheckout(
		input: NewBuildStartInput & {
			target: { mode: "base-checkout"; confirmed: true; path: string; branch: string; dirtyCount?: number };
		},
	): Promise<SessionStartResult | undefined>;
	cancel(): Promise<void>;
}

export function createNewBuildStateMachine(deps: NewBuildStateMachineDependencies): NewBuildStateMachine {
	let state: NewBuildState = { kind: "draft", prompt: "" };
	const setState = (next: NewBuildState) => {
		state = next;
		deps.onState?.(state);
	};
	const nextOperationId = () => deps.nextOperationId?.() ?? `new-build-${crypto.randomUUID()}`;
	const run = async (input: NewBuildStartInput): Promise<SessionStartResult | undefined> => {
		setState({ kind: "derivingTarget", prompt: input.prompt });
		if (input.target?.mode === "base-checkout") {
			const dirtyCount = input.target.dirtyCount ?? 0;
			if (!input.target.confirmed) {
				setState({
					kind: "baseCheckoutConfirming",
					prompt: input.prompt,
					path: input.target.path,
					branch: input.target.branch,
					dirtyCount,
				});
				return undefined;
			}
			return start(input, {
				mode: "base-checkout",
				projectId: input.projectId,
				confirmation: {
					confirmed: true,
					evidence: `GUI confirmed base checkout ${input.target.path}@${input.target.branch}`,
				},
			});
		}

		try {
			const isolatedTarget = input.target as
				| {
						readonly mode?: "isolated-worktree";
						readonly worktreeId?: string;
						readonly branch?: string;
						readonly path?: string;
				  }
				| undefined;
			const branch = isolatedTarget?.branch ?? deriveBranch(input.prompt);
			let worktree: WorkflowWorktreeMetadata | undefined;
			if (isolatedTarget?.worktreeId) {
				worktree = (await deps.listWorktrees?.(input.projectId))?.find(
					(candidate) => candidate.id === isolatedTarget.worktreeId,
				);
				if (!worktree) throw new Error(`Worktree not found: ${isolatedTarget.worktreeId}`);
			} else {
				setState({
					kind: "creatingWorktree",
					prompt: input.prompt,
					branchPreview: branch,
					pathPreview: isolatedTarget?.path,
				});
				const createResult = await deps.createWorktree({
					projectId: input.projectId,
					branch,
					path: isolatedTarget?.path,
					operationId: nextOperationId(),
				});
				const outcome = normalizeWorktreeCreateOutcome(createResult);
				if (outcome.outcome === "conflict" || outcome.outcome === "rolled-back" || outcome.outcome === "failed") {
					setState({
						kind: "setupFailed",
						prompt: input.prompt,
						message: worktreeOutcomeMessage(outcome),
						retryAction: outcome.outcome === "conflict" ? "edit-branch" : "retry",
						outcome,
					});
					return undefined;
				}
				worktree = outcome.worktree;
			}

			setState({ kind: "verifyingWorktree", prompt: input.prompt, worktree });
			const verified = deps.listWorktrees
				? (await deps.listWorktrees(input.projectId)).find((candidate) => candidate.id === worktree.id)
				: worktree;
			if (!verified) {
				setState({
					kind: "partialWorktreeCreated",
					prompt: input.prompt,
					worktree,
					message: "Created worktree could not be verified.",
				});
				return undefined;
			}
			setState({ kind: "readyToStart", prompt: input.prompt, worktree: verified });
			return await start(input, { mode: "isolated-worktree", projectId: input.projectId, worktreeId: verified.id });
		} catch (error) {
			setState({ kind: "setupFailed", prompt: input.prompt, message: errorMessage(error), retryAction: "retry" });
			return undefined;
		}
	};
	const start = async (input: NewBuildStartInput, startTarget: NonNullable<SessionStartParams["startTarget"]>) => {
		setState({ kind: "startingSession", prompt: input.prompt, startTarget });
		const result = await deps.startSession({
			projectId: input.projectId,
			prompt: input.prompt,
			attachmentIds: input.attachmentIds ? [...input.attachmentIds] : undefined,
			filePaths: input.filePaths ? [...input.filePaths] : undefined,
			model: input.model,
			effort: input.effort,
			accessMode: input.accessMode,
			mode: input.mode,
			fastMode: input.fastMode,
			draftState: input.draftState,
			startTarget,
			operationId: nextOperationId(),
		});
		setState({ kind: "running", prompt: input.prompt, sessionId: result.sessionId, runsIn: result.runsIn });
		return result;
	};
	return {
		get state() {
			return state;
		},
		start: run,
		confirmBaseCheckout: run,
		async cancel() {
			setState({ kind: "cancelingSetup", prompt: state.prompt });
			setState({ kind: "setupCanceled", prompt: state.prompt });
		},
	};
}

function normalizeWorktreeCreateOutcome(
	result: WorkflowWorktreeMetadata | WorktreeCreateResult,
): WorktreeCreateOutcome {
	if ("outcome" in result) return result;
	if ("worktree" in result) return { outcome: "created", worktree: result.worktree };
	return { outcome: "created", worktree: result };
}

function worktreeOutcomeMessage(outcome: WorktreeCreateOutcome): string {
	const suffix = [
		outcome.operationId ? `operation ${outcome.operationId}` : undefined,
		"reason" in outcome && outcome.reason ? `reason ${outcome.reason}` : undefined,
	]
		.filter(Boolean)
		.join(" · ");
	const detail = suffix ? ` (${suffix})` : "";
	if (outcome.outcome === "conflict") return `${outcome.message}${detail}`;
	if (outcome.outcome === "rolled-back") return `${outcome.message}${detail}`;
	if (outcome.outcome === "failed") return `${outcome.message}${detail}`;
	return "Worktree created.";
}
function deriveBranch(prompt: string): string {
	const slug =
		prompt
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 40) || "new-build";
	return `build/${slug}`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
