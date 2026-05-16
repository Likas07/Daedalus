import type { WorkspaceResumeSafetyDiagnostic } from "../../core/session-cwd.js";

export type InteractiveResumeRecoveryChoice = "switch_original_workspace" | "fork_current_workspace" | "cancel";

export interface InteractiveResumeRecoveryAction {
	kind: "branch_mismatch_recovery";
	reason: "branch_mismatch";
	message: string;
	choices: InteractiveResumeRecoveryChoice[];
}

export function getInteractiveResumeRecoveryAction(
	diagnostic: WorkspaceResumeSafetyDiagnostic,
): InteractiveResumeRecoveryAction | undefined {
	if (diagnostic.issues.length !== 1) return undefined;

	const [issue] = diagnostic.issues;
	if (issue?.code !== "branch_mismatch") return undefined;

	return {
		kind: "branch_mismatch_recovery",
		reason: "branch_mismatch",
		message: "Current branch does not match the session branch. Choose how to continue.",
		choices: ["switch_original_workspace", "fork_current_workspace", "cancel"],
	};
}
