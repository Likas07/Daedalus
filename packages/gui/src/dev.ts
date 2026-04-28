import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const host = "127.0.0.1";
const appServerPort = 43117;
const defaultGuiPort = 5174;
const guiPortEnvVar = "DAEDALUS_GUI_DEV_PORT";
const devToken = "daedalus-gui-dev-token";

const repoRoot = resolve(import.meta.dir, "../../..");
const guiRoot = resolve(import.meta.dir, "..");
const stateDir = resolve(repoRoot, ".daedalus/gui-dev");
const tokenFile = resolve(stateDir, "app-server.token");
const databasePath = resolve(stateDir, "app-server.sqlite");
const appServerEntry = resolve(repoRoot, "packages/app-server/src/server/main.ts");

type DevSubprocess = ReturnType<typeof Bun.spawn>;

const children = new Set<DevSubprocess>();

function guiDevPort(env: Pick<NodeJS.ProcessEnv, string> = Bun.env): number {
	const rawPort = env[guiPortEnvVar];
	if (rawPort === undefined || rawPort === "") return defaultGuiPort;
	const port = Number(rawPort);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new Error(`${guiPortEnvVar} must be a TCP port between 1 and 65535; got ${JSON.stringify(rawPort)}`);
	}
	return port;
}

async function main(): Promise<void> {
	await mkdir(dirname(tokenFile), { recursive: true });
	await writeFile(tokenFile, `${devToken}\n`, { mode: 0o600 });

	const _appServer = spawn("app-server", [
		"bun",
		appServerEntry,
		"--host",
		host,
		"--port",
		String(appServerPort),
		"--db",
		databasePath,
		"--token-file",
		tokenFile,
	]);
	await waitForHealth(`http://${host}:${appServerPort}/health`);

	spawn("vite", ["bun", "x", "vite", "--host", host, "--port", String(guiDevPort()), "--strictPort"], {
		VITE_DAEDALUS_APP_SERVER_WS: `ws://${host}:${appServerPort}/ws`,
		VITE_DAEDALUS_APP_SERVER_ENDPOINT: `http://${host}:${appServerPort}`,
		VITE_DAEDALUS_APP_SERVER_TOKEN: devToken,
		VITE_DAEDALUS_PROJECT_ROOT: repoRoot,
	});

	await new Promise<never>(() => {});
}

function spawn(name: string, cmd: string[], env: Record<string, string> = {}): DevSubprocess {
	const child = Bun.spawn(cmd, {
		cwd: name === "vite" ? guiRoot : repoRoot,
		env: { ...Bun.env, ...env },
		stdout: "inherit",
		stderr: "inherit",
	});
	children.add(child);
	child.exited.then((code) => {
		children.delete(child);
		if (code !== 0) {
			console.error(`${name} exited with code ${code}`);
			shutdown(code ?? 1);
		}
	});
	return child;
}

async function waitForHealth(url: string): Promise<void> {
	const deadline = Date.now() + 10_000;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
			lastError = new Error(`health returned ${response.status}`);
		} catch (error) {
			lastError = error;
		}
		await Bun.sleep(100);
	}
	throw new Error(`Timed out waiting for app-server at ${url}: ${String(lastError)}`);
}

function shutdown(code = 0): never {
	for (const child of children) child.kill();
	process.exit(code);
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

main().catch((error) => {
	console.error(error);
	shutdown(1);
});
