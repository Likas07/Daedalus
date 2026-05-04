import { join, resolve } from "node:path";

const host = "127.0.0.1";
export const defaultGuiDevPort = 58_473;
const guiPortEnvVar = "DAEDALUS_GUI_DEV_PORT";

const repoRoot = resolve(import.meta.dir, "../../..");
const desktopRoot = resolve(import.meta.dir, "..");
const guiRoot = resolve(repoRoot, "packages/gui");
const devMainEntry = join(desktopRoot, ".daedalus", "desktop-dev", "main.js");

type DevSubprocess = ReturnType<typeof Bun.spawn>;
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const children = new Set<DevSubprocess>();
let shuttingDown = false;

export interface WaitForUrlOptions {
	timeoutMs?: number;
	intervalMs?: number;
	fetcher?: Fetcher;
}

export const linuxElectronChromiumFlags = [
	"--disable-gpu",
	"--disable-gpu-compositing",
	"--disable-gpu-rasterization",
	"--disable-accelerated-video-decode",
	"--disable-accelerated-video-encode",
	"--disable-features=VaapiVideoDecoder,VaapiVideoEncoder,Vulkan",
	"--ozone-platform=x11",
] as const;

export function electronChromiumFlags(platform: NodeJS.Platform = process.platform): string[] {
	return platform === "linux" ? [...linuxElectronChromiumFlags] : [];
}

export function electronDevCommand(entry = devMainEntry, platform: NodeJS.Platform = process.platform): string[] {
	return ["electron", ...electronChromiumFlags(platform), entry];
}

export function guiDevPort(env: Pick<NodeJS.ProcessEnv, string> = Bun.env): number {
	const rawPort = env[guiPortEnvVar];
	if (rawPort === undefined || rawPort === "") return defaultGuiDevPort;
	const port = Number(rawPort);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new Error(`${guiPortEnvVar} must be a TCP port between 1 and 65535; got ${JSON.stringify(rawPort)}`);
	}
	return port;
}

export function guiDevUrl(env: Pick<NodeJS.ProcessEnv, string> = Bun.env): string {
	return `http://${host}:${guiDevPort(env)}/`;
}

export async function isDaedalusGuiServing(url: string, fetcher: Fetcher = fetch): Promise<boolean> {
	try {
		const response = await fetcher(url, { cache: "no-store" });
		if (!response.ok) return false;
		const html = await response.text();
		return (
			html.includes('name="daedalus-app"') &&
			html.includes('content="gui"') &&
			html.includes('id="root"') &&
			html.includes('src="/src/main.tsx"')
		);
	} catch {
		return false;
	}
}

export async function isUrlServing(url: string, fetcher: Fetcher = fetch): Promise<boolean> {
	try {
		const response = await fetcher(url, { cache: "no-store" });
		return response.ok;
	} catch {
		return false;
	}
}

export async function waitForUrl(
	url: string,
	options: WaitForUrlOptions & { verifier?: (url: string, fetcher: Fetcher) => Promise<boolean> } = {},
): Promise<void> {
	const timeoutMs = options.timeoutMs ?? 15_000;
	const intervalMs = options.intervalMs ?? 100;
	const fetcher = options.fetcher ?? fetch;
	const verifier = options.verifier;
	const deadline = Date.now() + timeoutMs;
	let lastStatus = "no response";

	while (Date.now() < deadline) {
		try {
			if (verifier) {
				if (await verifier(url, fetcher)) return;
				lastStatus = "not Daedalus GUI";
			} else {
				const response = await fetcher(url, { cache: "no-store" });
				if (response.ok) return;
				lastStatus = `HTTP ${response.status}`;
			}
		} catch (error) {
			lastStatus = error instanceof Error ? error.message : String(error);
		}
		await Bun.sleep(intervalMs);
	}

	throw new Error(`Timed out waiting for ${url}: ${lastStatus}`);
}

async function main(): Promise<void> {
	await run("desktop build", ["bun", "run", "build:dev"], { cwd: desktopRoot });

	const port = guiDevPort();
	const devUrl = guiDevUrl();
	let spawnedVite = false;
	if (await isDaedalusGuiServing(devUrl)) {
		console.log(`Reusing Daedalus GUI Vite at ${devUrl}`);
	} else if (await isUrlServing(devUrl)) {
		throw new Error(
			`Port ${port} is already serving a non-Daedalus app. Stop that process or set ${guiPortEnvVar} to a free port.`,
		);
	} else {
		console.log(`Starting Vite at ${devUrl}`);
		spawn("vite", ["bun", "run", "dev", "--", "--host", host, "--port", String(port), "--strictPort"], {
			cwd: guiRoot,
		});
		spawnedVite = true;
	}

	await waitForUrl(devUrl, { verifier: isDaedalusGuiServing });

	if (Bun.env.DAEDALUS_DESKTOP_DEV_CHECK === "1") {
		if (spawnedVite) shutdown(0);
		return;
	}

	console.log(`Launching Electron with Daedalus GUI at ${devUrl}`);
	const electron = spawn("electron", electronDevCommand(), {
		cwd: desktopRoot,
		env: {
			DAEDALUS_PROJECT_ROOT: repoRoot,
			DAEDALUS_GUI_DEV_URL: devUrl,
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
		if (shuttingDown) return;
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
	shuttingDown = true;
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
