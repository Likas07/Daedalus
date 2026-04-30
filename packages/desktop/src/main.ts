import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";

import type { AppServerBootDiagnostics } from "./boot-diagnostics";
import { deepLinkUrl, installDaedalusMenu, openFileDialog } from "./menu";
import { isSafeExternalUrl, toRendererServerBootstrap } from "./native-bridge";
import { NativeCommandRouter } from "./native-command-router";
import { showDesktopNotification } from "./notifications";
import { addRecentProject, clearRecentProjects, listRecentProjects } from "./recent-projects";
import { appServerDatabasePath, appServerTokenFilePath, daedalusGlobalStateDir } from "./server-manifest";
import { type AppServerEndpoint, ensureAppServer, ensureTokenFile } from "./server-process";

const moduleDir = dirname(fileURLToPath(import.meta.url));

const linuxRenderingDisabledFeatures = ["VaapiVideoDecoder", "VaapiVideoEncoder", "Vulkan"] as const;

function configureLinuxRenderingForCompatibility(): void {
	if (process.platform !== "linux") return;

	app.disableHardwareAcceleration();
	app.commandLine.appendSwitch("disable-gpu");
	app.commandLine.appendSwitch("disable-gpu-compositing");
	app.commandLine.appendSwitch("disable-gpu-rasterization");
	app.commandLine.appendSwitch("disable-accelerated-video-decode");
	app.commandLine.appendSwitch("disable-accelerated-video-encode");
	app.commandLine.appendSwitch("disable-features", linuxRenderingDisabledFeatures.join(","));
	app.commandLine.appendSwitch("ozone-platform", "x11");
}

configureLinuxRenderingForCompatibility();
const projectRoot = process.env.DAEDALUS_PROJECT_ROOT
	? resolve(process.cwd(), process.env.DAEDALUS_PROJECT_ROOT)
	: resolve(moduleDir, "..", "..", "..");

let mainWindow: BrowserWindow | undefined;
let lastDesktopBootDiagnostics: AppServerBootDiagnostics | undefined;
let embeddedAppServer: { readonly httpUrl: string; readonly wsUrl: string; stop(): Promise<void> } | undefined;
let embeddedAppServerEndpoint: AppServerEndpoint | undefined;
let embeddedAppServerPromise: Promise<AppServerEndpoint> | undefined;
const nativeCommands = new NativeCommandRouter({
	getMainWindow: () => mainWindow,
	getDesktopBootDiagnostics: () => lastDesktopBootDiagnostics,
});
const refreshMenu = (): void =>
	installDaedalusMenu({
		getMainWindow: () => mainWindow,
		router: nativeCommands,
		onRecentProjectsChanged: refreshMenu,
	});

function dispatchDeepLink(url: string): void {
	if (mainWindow) {
		nativeCommands.send("open-deep-link", { url });
		mainWindow.focus();
		return;
	}
	app.whenReady().then(() => {
		const window = createMainWindow();
		window.webContents.once("did-finish-load", () => nativeCommands.send("open-deep-link", { url }));
	});
}

function createMainWindow(): BrowserWindow {
	const window = new BrowserWindow({
		width: 1280,
		height: 840,
		title: "Daedalus",
		webPreferences: {
			preload: join(moduleDir, "preload.cjs"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	mainWindow = window;
	void loadRenderer(window);
	window.on("closed", () => {
		if (mainWindow === window) mainWindow = undefined;
	});
	return window;
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
	const devUrl = process.env.DAEDALUS_GUI_DEV_URL ?? process.env.VITE_DEV_SERVER_URL;
	if (devUrl) {
		await window.loadURL(devUrl);
		return;
	}

	const endpoint = await ensureDesktopGuiAppServer();
	await window.loadURL(endpoint.endpoint);
}

async function ensureDesktopGuiAppServer(): Promise<AppServerEndpoint> {
	if (embeddedAppServerEndpoint) return embeddedAppServerEndpoint;
	if (embeddedAppServerPromise) return embeddedAppServerPromise;
	embeddedAppServerPromise = startEmbeddedGuiAppServer().finally(() => {
		embeddedAppServerPromise = undefined;
	});
	return embeddedAppServerPromise;
}

async function startEmbeddedGuiAppServer(): Promise<AppServerEndpoint> {
	const appServerSpecifier = "@daedalus-pi/app-server";
	const { startAppServer } = (await import(appServerSpecifier)) as {
		startAppServer(options: Record<string, unknown>): Promise<NonNullable<typeof embeddedAppServer>>;
	};
	const stateDir = daedalusGlobalStateDir();
	const tokenFile = ensureTokenFile(appServerTokenFilePath(stateDir));
	const dbPath = appServerDatabasePath(stateDir);
	const token = readFileSync(tokenFile, "utf8").trim();
	embeddedAppServer = await startAppServer({
		databasePath: dbPath,
		token,
		serveGui: true,
		projectRoot,
	});
	embeddedAppServerEndpoint = {
		endpoint: embeddedAppServer.httpUrl,
		wsEndpoint: embeddedAppServer.wsUrl,
		tokenFile,
		dbPath,
		pid: process.pid,
		appServerVersion: "0.1.0",
	};
	return embeddedAppServerEndpoint;
}

function registerIpc(): void {
	ipcMain.handle("daedalus:app:get-branding", () => ({
		name: app.getName() || "Daedalus",
		version: app.getVersion(),
	}));
	ipcMain.handle("daedalus:app:get-environment", () => ({
		platform: process.platform,
		arch: process.arch,
		homeDir: homedir(),
	}));
	ipcMain.handle("daedalus:app:confirm", async (_event, input: { message?: string; title?: string }) => {
		const result = mainWindow
			? await dialog.showMessageBox(mainWindow, {
					type: "question",
					buttons: ["Cancel", "OK"],
					defaultId: 1,
					cancelId: 0,
					title: input.title ?? "Confirm",
					message: input.message ?? "Continue?",
				})
			: await dialog.showMessageBox({
					type: "question",
					buttons: ["Cancel", "OK"],
					defaultId: 1,
					cancelId: 0,
					title: input.title ?? "Confirm",
					message: input.message ?? "Continue?",
				});
		return result.response === 1;
	});
	ipcMain.handle("daedalus:shell:open-folder", async (_event, input: { path?: string }) => {
		const target = input.path;
		if (target) {
			await shell.openPath(target);
			return target;
		}
		const result = mainWindow
			? await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] })
			: await dialog.showOpenDialog({ properties: ["openDirectory"] });
		return result.canceled ? undefined : result.filePaths[0];
	});
	ipcMain.handle("daedalus:shell:open-file", async (_event, input: { path?: string }) => {
		if (input.path) {
			await shell.openPath(input.path);
			return input.path;
		}
		return openFileDialog(mainWindow);
	});
	ipcMain.handle(
		"daedalus:shell:open-external-editor",
		async (_event, input: { path?: string; projectId?: string; sessionId?: string; worktreeId?: string } = {}) => {
			const target = input.path;
			if (!target) throw new Error("Missing path for external editor");
			// Desktop may open a server-projected path, but it must not reinterpret that path
			// as the mutation target. Preserve IDs for renderer/app-server flows that need
			// project/session/worktree identity rather than raw filesystem truth.
			await shell.openPath(target);
			return {
				path: target,
				projectId: input.projectId,
				sessionId: input.sessionId,
				worktreeId: input.worktreeId,
			};
		},
	);
	ipcMain.handle("daedalus:shell:open-external-url", async (_event, input: { url?: string }) => {
		if (!input.url || !isSafeExternalUrl(input.url)) throw new Error("Unsupported external URL");
		await shell.openExternal(input.url);
	});
	ipcMain.handle(
		"daedalus:notifications:show",
		(_event, input: { kind: Parameters<typeof showDesktopNotification>[0]["kind"]; body?: string }) =>
			showDesktopNotification({ kind: input.kind, body: input.body }),
	);
	ipcMain.handle("daedalus:recent-projects:list", () => listRecentProjects());
	ipcMain.handle("daedalus:recent-projects:add", (_event, input: { path: string }) => {
		const projects = addRecentProject(input.path);
		refreshMenu();
		return projects;
	});
	ipcMain.handle("daedalus:recent-projects:clear", () => {
		clearRecentProjects();
		refreshMenu();
	});
	ipcMain.handle(
		"daedalus:deep-links:open",
		(_event, input: { projectId?: string; sessionId?: string; worktreeId?: string }) => {
			nativeCommands.send("open-deep-link", { url: deepLinkUrl(input) });
		},
	);
	ipcMain.handle("daedalus:server:bootstrap-endpoint", async () => {
		const endpoint =
			embeddedAppServerEndpoint ??
			(embeddedAppServerPromise
				? await embeddedAppServerPromise
				: await ensureAppServer({ packaged: app.isPackaged }));
		lastDesktopBootDiagnostics = endpoint.bootDiagnostics;
		return { ...toRendererServerBootstrap(endpoint), desktopBoot: endpoint.bootDiagnostics };
	});
	ipcMain.handle("daedalus:updates:get-state", () => ({ status: "idle" as const }));
}

registerIpc();
app.setAsDefaultProtocolClient("daedalus");
app.on("open-url", (event, url) => {
	event.preventDefault();
	dispatchDeepLink(url);
});
const argvDeepLink = process.argv.find((arg) => arg.startsWith("daedalus://"));
if (argvDeepLink) app.whenReady().then(() => dispatchDeepLink(argvDeepLink));
app.whenReady().then(() => {
	if (!mainWindow) createMainWindow();
	refreshMenu();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
	});
});
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
