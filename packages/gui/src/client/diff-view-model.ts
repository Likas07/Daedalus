import type { WorkflowChangedFile } from "@daedalus-pi/app-server-protocol";
import type { RendererAccessPolicy, RendererDiffSummary } from "./gui-state-types";

export interface DiffFileNode {
	readonly kind: "file";
	readonly name: string;
	readonly path: string;
	readonly status: WorkflowChangedFile["status"];
	readonly additions: number;
	readonly deletions: number;
	readonly staged: boolean;
	readonly selected: boolean;
}

export interface DiffDirectoryNode {
	readonly kind: "directory";
	readonly name: string;
	readonly path: string;
	readonly children: readonly DiffTreeNode[];
}

export type DiffTreeNode = DiffFileNode | DiffDirectoryNode;

export interface DiffReviewViewModel {
	readonly files: readonly WorkflowChangedFile[];
	readonly tree: readonly DiffTreeNode[];
	readonly selectedPath: string | null;
	readonly selectedPatch: string;
	readonly workingTreeDiffId?: string;
	readonly checkpointDiffId?: string;
	readonly canMutate: boolean;
	readonly mutationDisabledReason?: string;
}

export interface BuildDiffReviewInput {
	readonly diff?: RendererDiffSummary;
	readonly selectedPath?: string | null;
	readonly workingTreeDiffId?: string;
	readonly checkpointDiffId?: string;
	readonly capabilities?: Record<string, boolean>;
	readonly accessPolicy?: RendererAccessPolicy;
}

export function buildDiffReviewViewModel(input: BuildDiffReviewInput): DiffReviewViewModel {
	const files = input.diff?.files ?? [];
	const selectedPath = input.selectedPath && files.some((file) => file.path === input.selectedPath) ? input.selectedPath : (files[0]?.path ?? null);
	const canMutate = input.capabilities?.gitMutations === true && input.accessPolicy?.mode === "unrestricted";
	const mutationDisabledReason = input.capabilities?.gitMutations !== true ? "Backend does not advertise Git mutation capability." : input.accessPolicy?.mode !== "unrestricted" ? "Git mutations require unrestricted approval policy." : undefined;
	return {
		files,
		tree: buildChangedFilesTree(files, selectedPath),
		selectedPath,
		selectedPatch: selectedPath ? extractFilePatch(input.diff?.patch ?? "", selectedPath) : (input.diff?.patch ?? ""),
		workingTreeDiffId: input.workingTreeDiffId,
		checkpointDiffId: input.checkpointDiffId,
		canMutate,
		mutationDisabledReason,
	};
}

interface MutableDirectory { name: string; path: string; dirs: Map<string, MutableDirectory>; files: DiffFileNode[] }

export function buildChangedFilesTree(files: readonly WorkflowChangedFile[], selectedPath: string | null): readonly DiffTreeNode[] {
	const root: MutableDirectory = { name: "", path: "", dirs: new Map(), files: [] };
	for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
		const parts = file.path.split("/");
		let dir = root;
		let currentPath = "";
		for (const part of parts.slice(0, -1)) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			let child = dir.dirs.get(part);
			if (!child) {
				child = { name: part, path: currentPath, dirs: new Map(), files: [] };
				dir.dirs.set(part, child);
			}
			dir = child;
		}
		dir.files.push({ kind: "file", name: parts.at(-1) ?? file.path, path: file.path, status: file.status, additions: file.insertions, deletions: file.deletions, staged: file.staged, selected: file.path === selectedPath });
	}
	return materialize(root);
}

function materialize(dir: MutableDirectory): readonly DiffTreeNode[] {
	return [...dir.files, ...[...dir.dirs.values()].map((child) => ({ kind: "directory" as const, name: child.name, path: child.path, children: materialize(child) }))];
}

export function extractFilePatch(patch: string, path: string): string {
	if (!patch.trim()) return "";
	const lines = patch.split("\n");
	const chunks: string[] = [];
	let current: string[] = [];
	let include = false;
	for (const line of lines) {
		if (line.startsWith("diff --git ")) {
			if (include) chunks.push(current.join("\n"));
			current = [line];
			include = line.includes(` a/${path} `) || line.endsWith(` b/${path}`) || line.includes(` b/${path}`);
		} else current.push(line);
	}
	if (include) chunks.push(current.join("\n"));
	return chunks.join("\n");
}


