export const guiCorePackageName = "@daedalus-pi/gui-core";

export interface GuiProjectSummary {
	readonly id: string;
	readonly name: string;
	readonly path: string;
}

export interface GuiThreadSummary {
	readonly id: string;
	readonly projectId: string;
	readonly title: string;
	readonly updatedAt: string;
}

export interface GuiShellState {
	readonly activeProjectId?: string;
	readonly activeThreadId?: string;
	readonly projects: readonly GuiProjectSummary[];
	readonly threads: readonly GuiThreadSummary[];
}

export function createEmptyGuiShellState(): GuiShellState {
	return {
		projects: [],
		threads: [],
	};
}

export function formatProjectDisplayName(project: Pick<GuiProjectSummary, "name" | "path">): string {
	return project.name.trim() || project.path;
}

export * from "./thread/reducer";
export * from "./thread/selectors";
export * from "./thread/view-model";
export * from "./thread/presentation";
