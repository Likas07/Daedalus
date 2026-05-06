import type { WorkflowWorktreeMetadata } from "@daedalus-pi/app-server-protocol";

export interface ProviderStatus {
	readonly provider?: string;
	readonly enabled?: boolean;
	readonly authenticated?: boolean;
	readonly status?: string;
}

export interface GuiState {
	readonly projectRoot?: string;
	readonly lastProjectId?: string;
	readonly providerStatuses?: readonly ProviderStatus[];
	readonly selectedModel?: string;
	readonly models?: readonly { id: string; provider?: string; available?: boolean }[];
	readonly worktrees?: readonly WorkflowWorktreeMetadata[];
	readonly newBuild?: { readonly kind?: string };
}

export type StartGateRequiredAction =
	| "enter-prompt"
	| "wait-for-upload"
	| "choose-project"
	| "resolve-worktree"
	| "configure-provider"
	| "wait-for-start"
	| "none";

export type StartGateTargetStatus = "ready" | "blocked" | "needs-attention" | "starting";

export interface StartGateInput {
	readonly prompt?: string;
	readonly projectPath?: string;
	readonly projectId?: string;
	readonly requireProject?: boolean;
	readonly uploading?: boolean;
	readonly disabled?: boolean;
	readonly disabledReason?: string;
	readonly providerStatuses?: readonly ProviderStatus[];
	readonly selectedModel?: string;
	readonly models?: readonly { id: string; provider?: string; available?: boolean }[];
	readonly worktrees?: readonly WorkflowWorktreeMetadata[];
	readonly activeWorktreeId?: string;
	readonly newBuildKind?: string;
}

export interface StartGateResult {
	readonly canSend: boolean;
	readonly canStartBuild: boolean;
	readonly disabledReason?: string;
	readonly requiredAction: StartGateRequiredAction;
	readonly targetStatus: StartGateTargetStatus;
}

export function computeStartGate(input: StartGateInput): StartGateResult {
	const prompt = input.prompt?.trim() ?? "";
	const projectPath = input.projectPath?.trim() ?? "";
	const projectId = input.projectId?.trim() ?? "";
	const worktree = activeWorktree(input.worktrees ?? [], input.activeWorktreeId);
	const worktreeReason = unresolvedWorktreeReason(worktree);

	if (input.disabled) return blocked(input.disabledReason ?? "Composer is unavailable.", "none");
	if (!prompt) return blocked("Enter a prompt before submitting.", "enter-prompt");
	if (input.uploading) return blocked("Wait for file uploads to finish before submitting.", "wait-for-upload");
	if (input.requireProject && !projectPath && !projectId)
		return blocked("Choose a project path before starting a session.", "choose-project");
	if (isAlreadyStarting(input.newBuildKind))
		return {
			canSend: false,
			canStartBuild: false,
			disabledReason: "A build is already starting.",
			requiredAction: "wait-for-start",
			targetStatus: "starting",
		};
	if (worktreeReason)
		return {
			canSend: false,
			canStartBuild: false,
			disabledReason: worktreeReason,
			requiredAction: "resolve-worktree",
			targetStatus: "needs-attention",
		};
	if (!providerAvailable(input))
		return blocked("No provider is available. Connect or select an available model first.", "configure-provider");
	return { canSend: true, canStartBuild: true, requiredAction: "none", targetStatus: "ready" };
}

export function computeStartGateFromGuiState(
	state: GuiState,
	input: Pick<
		StartGateInput,
		"prompt" | "projectPath" | "requireProject" | "uploading" | "disabled" | "disabledReason" | "activeWorktreeId"
	> = {},
): StartGateResult {
	return computeStartGate({
		...input,
		projectPath: input.projectPath ?? state.projectRoot,
		projectId: state.lastProjectId,
		providerStatuses: state.providerStatuses,
		selectedModel: state.selectedModel,
		models: state.models,
		worktrees: state.worktrees,
		newBuildKind: state.newBuild?.kind,
	});
}

function blocked(disabledReason: string, requiredAction: StartGateRequiredAction): StartGateResult {
	return { canSend: false, canStartBuild: false, disabledReason, requiredAction, targetStatus: "blocked" };
}

function activeWorktree(
	worktrees: readonly WorkflowWorktreeMetadata[],
	activeWorktreeId: string | undefined,
): WorkflowWorktreeMetadata | undefined {
	return activeWorktreeId ? worktrees.find((worktree) => String(worktree.id) === activeWorktreeId) : undefined;
}

function unresolvedWorktreeReason(worktree: WorkflowWorktreeMetadata | undefined): string | undefined {
	if (!worktree) return undefined;
	if (worktree.status === "needs-attention") return "Resolve the selected worktree before starting a build.";
	if (worktree.status === "invalid") return "Selected worktree is not ready. Resolve the worktree before starting.";
	if (worktree.cleanupRequiresConfirmation) return "Confirm or resolve worktree cleanup before starting a build.";
	if (worktree.cleanupRisk?.risky)
		return worktree.cleanupRisk.reasons[0]?.message ?? "Resolve worktree cleanup risk before starting.";
	return undefined;
}

function isAlreadyStarting(kind: string | undefined): boolean {
	return (
		kind === "derivingTarget" ||
		kind === "creatingWorktree" ||
		kind === "verifyingWorktree" ||
		kind === "readyToStart" ||
		kind === "startingSession"
	);
}

function providerAvailable(input: StartGateInput): boolean {
	const selected = input.selectedModel ? input.models?.find((model) => model.id === input.selectedModel) : undefined;
	if (selected) return selected.available !== false && providerReady(input.providerStatuses, selected.provider);
	if (input.models?.length)
		return input.models.some(
			(model) => model.available !== false && providerReady(input.providerStatuses, model.provider),
		);
	if (input.providerStatuses?.length)
		return input.providerStatuses.some((provider) => isUsableProviderStatus(provider));
	return true;
}

function providerReady(statuses: readonly ProviderStatus[] | undefined, providerId: string | undefined): boolean {
	if (!statuses?.length || !providerId) return true;
	const status = statuses.find((provider) => provider.provider === providerId);
	return !status || isUsableProviderStatus(status);
}

function isUsableProviderStatus(status: ProviderStatus): boolean {
	if (status.enabled === false || status.authenticated === false) return false;
	return status.status === "ready" || status.status === "oauth" || status.status === "env-key";
}
