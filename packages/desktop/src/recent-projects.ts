import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { app } from "electron";
import { daedalusGlobalStateDir } from "./server-manifest";

export interface RecentProject {
	readonly path: string;
	readonly openedAt: string;
}

const maxRecentProjects = 10;
let loaded = false;
const recentProjects: RecentProject[] = [];

export function recentProjectsPath(stateDir = daedalusGlobalStateDir()): string {
	return join(stateDir, "recent-projects.json");
}

function loadRecentProjects(): void {
	if (loaded) return;
	loaded = true;
	const path = recentProjectsPath();
	if (!existsSync(path)) return;
	try {
		const value = JSON.parse(readFileSync(path, "utf8")) as { projects?: RecentProject[] };
		recentProjects.splice(0, recentProjects.length, ...sanitizeRecentProjects(value.projects ?? []));
	} catch {
		recentProjects.splice(0);
	}
}

function persistRecentProjects(): void {
	const path = recentProjectsPath();
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify({ projects: recentProjects }, null, "\t")}\n`, "utf8");
}

function sanitizeRecentProjects(projects: readonly RecentProject[]): RecentProject[] {
	const seen = new Set<string>();
	const result: RecentProject[] = [];
	for (const project of projects) {
		if (!project || typeof project.path !== "string" || !isAbsolute(project.path) || seen.has(project.path)) continue;
		if (typeof project.openedAt !== "string") continue;
		seen.add(project.path);
		result.push({ path: project.path, openedAt: project.openedAt });
		if (result.length >= maxRecentProjects) break;
	}
	return result;
}

export function isBackendConfirmedProjectPath(path: string): boolean {
	loadRecentProjects();
	return recentProjects.some((project) => project.path === path);
}
export function addRecentProject(path: string): readonly RecentProject[] {
	loadRecentProjects();
	if (!isAbsolute(path)) throw new Error("Recent project path must be absolute");
	app.addRecentDocument(path);
	const existing = recentProjects.findIndex((project) => project.path === path);
	if (existing >= 0) recentProjects.splice(existing, 1);
	recentProjects.unshift({ path, openedAt: new Date().toISOString() });
	recentProjects.splice(maxRecentProjects);
	persistRecentProjects();
	return listRecentProjects();
}

export function clearRecentProjects(): void {
	loadRecentProjects();
	recentProjects.splice(0);
	persistRecentProjects();
	app.clearRecentDocuments();
}

export function listRecentProjects(): readonly RecentProject[] {
	loadRecentProjects();
	return recentProjects.map((project) => ({ ...project }));
}
