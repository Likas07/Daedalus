import { app, type BrowserWindow, dialog, Menu, type MenuItemConstructorOptions } from "electron";
import type { NativeCommandRouter } from "./native-command-router";
import { clearRecentProjects, listRecentProjects } from "./recent-projects";

export interface InstallDaedalusMenuOptions {
	readonly getMainWindow: () => BrowserWindow | undefined;
	readonly router?: NativeCommandRouter;
	readonly onRecentProjectsChanged?: () => void;
}

export async function openProjectDialog(window?: BrowserWindow): Promise<string | undefined> {
	const result = window
		? await dialog.showOpenDialog(window, { properties: ["openDirectory"] })
		: await dialog.showOpenDialog({ properties: ["openDirectory"] });
	return result.canceled ? undefined : result.filePaths[0];
}

export async function openFileDialog(window?: BrowserWindow): Promise<string | undefined> {
	const result = window
		? await dialog.showOpenDialog(window, { properties: ["openFile"] })
		: await dialog.showOpenDialog({ properties: ["openFile"] });
	return result.canceled ? undefined : result.filePaths[0];
}

export function installDaedalusMenu(options: InstallDaedalusMenuOptions): void {
	const openProject = async () => {
		const path = await openProjectDialog(options.getMainWindow());
		if (!path) return;
		options.router?.send("open-project", { path });
	};
	const template: MenuItemConstructorOptions[] = [
		{
			label: app.name || "Daedalus",
			submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }],
		},
		{
			label: "File",
			submenu: [
				{ label: "Open Project…", accelerator: "CmdOrCtrl+O", click: openProject },
				{
					label: "Recent Projects",
					submenu: [
						...listRecentProjects().map((project) => ({
							label: project.path,
							click: () => options.router?.send("open-recent-project", { path: project.path }),
						})),
						{ type: "separator" },
						{ label: "Clear Recent Projects", click: () => { clearRecentProjects(); options.onRecentProjectsChanged?.(); } },
					],
				},
			],
		},
		{
			label: "View",
			submenu: [
				{ role: "reload" },
				{ role: "toggleDevTools" },
				{ type: "separator" },
				{ label: "Toggle Terminal", accelerator: "Ctrl+`", click: () => options.router?.send("toggle-terminal", {}) },
				{ label: "Export Diagnostics…", click: () => options.router?.send("export-diagnostics", {}) },
				{ type: "separator" },
				{ role: "resetZoom" },
			],
		},
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

export function deepLinkUrl(input: { projectId?: string; sessionId?: string; worktreeId?: string }): string {
	const params = new URLSearchParams();
	if (input.projectId) params.set("project", input.projectId);
	if (input.sessionId) params.set("session", input.sessionId);
	if (input.worktreeId) params.set("worktree", input.worktreeId);
	return `daedalus://open?${params.toString()}`;
}
