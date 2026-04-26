import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface GuiCommandOptions {
	host: string;
	port: number;
	open: boolean;
	headless: boolean;
	project: string;
	reuseServer: boolean;
	newServer: boolean;
	logFile?: string;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export interface GuiCommandDeps {
	stdout?: Pick<typeof console, "log">;
	stderr?: Pick<typeof console, "error">;
	spawn?: typeof Bun.spawn;
	openBrowser?: (url: string) => Promise<void> | void;
	fetch?: FetchLike;
	randomToken?: () => string;
}

export function isGuiCommand(args: readonly string[]): boolean {
	return args[0] === "gui";
}

export function parseGuiCommand(args: readonly string[], cwd = process.cwd()): GuiCommandOptions {
	const options: GuiCommandOptions = {
		host: "127.0.0.1",
		port: 0,
		open: true,
		headless: false,
		project: cwd,
		reuseServer: true,
		newServer: false,
	};
	const rest = args[0] === "gui" ? args.slice(1) : args;
	for (let i = 0; i < rest.length; i += 1) {
		const arg = rest[i];
		const next = rest[i + 1];
		if (arg === "--host" && next) {
			options.host = next;
			i += 1;
		} else if (arg === "--port" && next) {
			options.port = Number(next);
			i += 1;
		} else if (arg === "--no-open") {
			options.open = false;
		} else if (arg === "--headless") {
			options.headless = true;
			options.open = false;
		} else if (arg === "--project" && next) {
			options.project = resolve(cwd, next);
			i += 1;
		} else if (arg === "--reuse-server") {
			options.reuseServer = true;
			options.newServer = false;
		} else if (arg === "--new-server") {
			options.newServer = true;
			options.reuseServer = false;
		} else if (arg === "--log-file" && next) {
			options.logFile = resolve(cwd, next);
			i += 1;
		}
	}
	return options;
}

export function isLoopbackHost(host: string): boolean {
	return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function appServerEntrypoint(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	return resolve(here, "../../../app-server/src/server/main.ts");
}

async function defaultOpenBrowser(url: string): Promise<void> {
	const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
	const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
	Bun.spawn([command, ...args], { stdout: "ignore", stderr: "ignore" });
}

async function canReuseServer(url: string, fetchImpl: FetchLike): Promise<boolean> {
	try {
		const response = await fetchImpl(`${url}/health`);
		return response.ok;
	} catch {
		return false;
	}
}

export async function runGuiCommand(rawArgs: readonly string[], deps: GuiCommandDeps = {}): Promise<void> {
	const options = parseGuiCommand(rawArgs);
	const stdout = deps.stdout ?? console;
	const stderr = deps.stderr ?? console;
	const fetchImpl = deps.fetch ?? fetch;
	const spawn = deps.spawn ?? Bun.spawn;
	const token = isLoopbackHost(options.host) ? undefined : (deps.randomToken?.() ?? crypto.randomUUID());
	const requestedUrl = `http://${options.host}:${options.port}`;
	if (!isLoopbackHost(options.host)) {
		stderr.error(`Warning: binding Daedalus GUI to non-loopback host ${options.host}; bearer token is required.`);
	}
	if (
		options.reuseServer &&
		!options.newServer &&
		options.port > 0 &&
		(await canReuseServer(requestedUrl, fetchImpl))
	) {
		stdout.log(`Daedalus GUI reusing app-server at ${requestedUrl}`);
		stdout.log(`Daedalus GUI ready: ${requestedUrl}`);
		if (options.open) await (deps.openBrowser ?? defaultOpenBrowser)(requestedUrl);
		return;
	}
	const dbPath = resolve(options.project, ".daedalus", "app-server.sqlite");
	if (options.logFile) await mkdir(dirname(options.logFile), { recursive: true });
	const proc = spawn(
		[
			"bun",
			appServerEntrypoint(),
			"--db",
			dbPath,
			"--host",
			options.host,
			"--port",
			String(options.port),
			"--gui",
			"--project",
			options.project,
			...(token ? ["--token", token] : []),
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const reader = proc.stdout.getReader();
	const chunk = await reader.read();
	reader.releaseLock();
	const line = new TextDecoder().decode(chunk.value).trim();
	if (options.logFile) await writeFile(options.logFile, line.replace(token ?? "", "<redacted>"));
	const first = line.split("\n").at(-1) ?? "{}";
	const info = JSON.parse(first) as { httpUrl: string; token?: string };
	const url = token ? `${info.httpUrl}/?token=${encodeURIComponent(token)}` : info.httpUrl;
	stdout.log(`Daedalus GUI ready: ${url}`);
	stdout.log(`Project: ${options.project}`);
	if (options.open) await (deps.openBrowser ?? defaultOpenBrowser)(url);
	if (options.headless && existsSync("/dev/null")) return;
}
