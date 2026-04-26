import { join, resolve } from "node:path";

const host = "127.0.0.1";
const guiPort = 5173;
const guiDevUrl = `http://${host}:${guiPort}/`;

const repoRoot = resolve(import.meta.dir, "../../..");
const desktopRoot = resolve(import.meta.dir, "..");
const guiRoot = resolve(repoRoot, "packages/gui");
const devMainEntry = join(desktopRoot, ".daedalus", "desktop-dev", "main.js");

type DevSubprocess = ReturnType<typeof Bun.spawn>;
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const children = new Set<DevSubprocess>();

export interface WaitForUrlOptions {
	timeoutMs?: number;
	intervalMs?: number;
	fetcher?: Fetcher;
}

export function electronDevCommand(entry = devMainEntry): string[] {
	return ["electron", entry];
}

export async function isUrlServing(url: string, fetcher: Fetcher = fetch): Promise<boolean> {
	try {
		const response = await fetcher(url, { cache: "no-store" });
		return response.ok;
	} catch {
		return false;
	}
}

export async function waitForUrl(url: string, options: WaitForUrlOptions = {}): Promise<void> {
	const timeoutMs = options.timeoutMs ?? 15_000;
	const intervalMs = options.intervalMs ?? 100;
	const fetcher = options.fetcher ?? fetch;
	const deadline = Date.now() + timeoutMs;
	let lastStatus = "no response";

	while (Date.now() < deadline) {
		try {
			const response = await fetcher(url, { cache: "no-store" });
			if (response.ok) return;
			lastStatus = `HTTP ${response.status}`;
		} catch (error) {
			lastStatus = error instanceof Error ? error.message : String(error);
		}
		await Bun.sleep(intervalMs);
	}

	throw new Error(`Timed out waiting for ${url}: ${lastStatus}`);
}

async function main(): Promise<void> {
	await run("desktop build", ["bun", "run", "build:dev"], { cwd: desktopRoot });

	let spawnedVite = false;
	if (await isUrlServing(guiDevUrl)) {
		console.log(`Reusing Vite at ${guiDevUrl}`);
	} else {
		console.log(`Starting Vite at ${guiDevUrl}`);
		spawn("vite", ["bun", "x", "vite", "--host", host, "--port", String(guiPort), "--strictPort"], { cwd: guiRoot });
		spawnedVite = true;
	}

	await waitForUrl(guiDevUrl);

	if (Bun.env.DAEDALUS_DESKTOP_DEV_CHECK === "1") {
		if (spawnedVite) shutdown(0);
		return;
	}

	const electron = spawn("electron", electronDevCommand(), {
		cwd: desktopRoot,
		env: {
			DAEDALUS_PROJECT_ROOT: repoRoot,
			DAEDALUS_GUI_DEV_URL: guiDevUrl,
		},
	});
	const code = await electron.exited;
	shutdown(code ?? 0);
}

function spawn(name: string, cmd: string[], options: { cwd: string; env?: Record<string, string> }): DevSubprocess {
	const child = Bun.spawn(cmd, {
		cwd: options.cwd,
		env: { ...Bun.env, ...options.env },
		stdout: "inherit",
		stderr: "inherit",
	});
	children.add(child);
	child.exited.then((code) => {
		children.delete(child);
		if (code !== 0 && name !== "electron") {
			console.error(`${name} exited with code ${code}`);
			shutdown(code ?? 1);
		}
	});
	return child;
}

async function run(name: string, cmd: string[], options: { cwd: string }): Promise<void> {
	const child = spawn(name, cmd, options);
	const code = await child.exited;
	if (code !== 0) throw new Error(`${name} failed with code ${code}`);
}

function shutdown(code = 0): never {
	for (const child of children) child.kill();
	process.exit(code);
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

if (import.meta.main) {
	main().catch((error) => {
		console.error(error);
		shutdown(1);
	});
}
