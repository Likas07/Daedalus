import { existsSync } from "node:fs";
import { app, BrowserWindow, ipcMain } from "electron";

const preload = process.argv.at(-1);

function exitFailure(message) {
	console.error(`[daedalus-preload-smoke] ${message}`);
	clearTimeout(timeout);
	app.exit(1);
}

if (!preload || !existsSync(preload)) {
	console.error(`[daedalus-preload-smoke] Missing preload file: ${preload ?? "<none>"}`);
	process.exit(1);
}

app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-dev-shm-usage");

const timeout = setTimeout(() => exitFailure("Timed out waiting for preload bridge"), 10_000);

async function main() {
	ipcMain.handle("daedalus:server:bootstrap-endpoint", () => ({
		endpoint: "http://127.0.0.1:43117",
		wsEndpoint: "ws://127.0.0.1:43117/ws",
		token: "desktop-token",
		dbPath: "/tmp/daedalus-preload-smoke.sqlite",
		appServerVersion: "preload-smoke",
	}));

	const window = new BrowserWindow({
		show: false,
		webPreferences: {
			preload,
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	await window.loadURL("data:text/html;charset=utf-8,<html><body>Daedalus preload smoke</body></html>");
	const result = await window.webContents.executeJavaScript(`
		(async () => {
			const bridge = window.daedalusNative;
			if (!bridge?.server || typeof bridge.server.bootstrapEndpoint !== "function") return { exposed: false };
			const bootstrap = await bridge.server.bootstrapEndpoint();
			return { exposed: true, bootstrap };
		})()
	`, true);
	if (!result?.exposed) throw new Error("window.daedalusNative.server.bootstrapEndpoint was not exposed");
	if (result.bootstrap?.endpoint !== "http://127.0.0.1:43117") {
		throw new Error(`Unexpected bootstrap endpoint: ${JSON.stringify(result.bootstrap)}`);
	}
	console.log(`[daedalus-preload-smoke] ${JSON.stringify(result)}`);
	clearTimeout(timeout);
	app.exit(0);
}

app.whenReady().then(main).catch((error) => {
	exitFailure(error instanceof Error ? error.stack || error.message : String(error));
});
