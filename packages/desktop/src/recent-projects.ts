import { app } from "electron";

export interface RecentProject {
	readonly path: string;
	readonly openedAt: string;
}

const maxRecentProjects = 10;
const recentProjects: RecentProject[] = [];

export function addRecentProject(path: string): readonly RecentProject[] {
	app.addRecentDocument(path);
	const existing = recentProjects.findIndex((project) => project.path === path);
	if (existing >= 0) recentProjects.splice(existing, 1);
	recentProjects.unshift({ path, openedAt: new Date().toISOString() });
	recentProjects.splice(maxRecentProjects);
	return listRecentProjects();
}

export function clearRecentProjects(): void {
	recentProjects.splice(0);
	app.clearRecentDocuments();
}

export function listRecentProjects(): readonly RecentProject[] {
	return recentProjects.map((project) => ({ ...project }));
}
