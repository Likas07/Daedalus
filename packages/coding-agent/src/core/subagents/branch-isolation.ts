export interface ChildBranchInput {
	parentBranch: string;
	agent: string;
	runId: string;
	template: string;
}

export function buildChildBranchName(input: ChildBranchInput): string {
	return input.template
		.replaceAll("{parentBranch}", input.parentBranch)
		.replaceAll("{agent}", input.agent)
		.replaceAll("{runId}", input.runId);
}

export interface BranchIsolationMetadata {
	enabled: boolean;
	parentBranch: string;
	childBranch: string;
	adoptionStrategy: "inspect" | "cherry-pick" | "merge" | "discard";
}
