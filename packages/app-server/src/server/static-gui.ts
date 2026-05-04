import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface StaticGuiOptions {
	readonly distDir?: string;
	readonly wsUrl: string;
	readonly token?: string;
	readonly projectRoot: string;
}

const CONTENT_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
};

export function guiDistDir(): string {
	return resolve(dirname(fileURLToPath(import.meta.url)), "../../../gui/dist");
}

function configuredGuiDistDir(): string | undefined {
	const distDir = Bun.env.DAEDALUS_GUI_DIST_DIR;
	return distDir ? resolve(distDir) : undefined;
}
export function defaultGuiDistDir(): string {
	return configuredGuiDistDir() ?? guiDistDir();
}

export function createGuiBootstrap(options: StaticGuiOptions): Record<string, string | undefined> {
	return {
		wsUrl: options.wsUrl,
		token: options.token,
		projectRoot: options.projectRoot,
	};
}

export function createGuiEnvironmentDescriptor() {
	return {
		environmentId: "local-daedalus",
		label: "Daedalus Local",
		platform: {
			os: process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "windows" : "linux",
			arch: process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : "other",
		},
		serverVersion: "daedalus-app-server",
		capabilities: { repositoryIdentity: true },
	};
}

export function createGuiAuthSessionState() {
	return {
		authenticated: true,
		auth: {
			policy: "unsafe-no-auth",
			bootstrapMethods: [],
			sessionMethods: ["bearer-session-token"],
			sessionCookieName: "daedalus_gui_session",
		},
		role: "owner",
		sessionMethod: "bearer-session-token",
	};
}

export async function serveStaticGui(request: Request, options: StaticGuiOptions): Promise<Response | undefined> {
	const url = new URL(request.url);
	if (url.pathname === "/api/gui/bootstrap") return Response.json(createGuiBootstrap(options));
	if (url.pathname === "/.well-known/t3/environment") return Response.json(createGuiEnvironmentDescriptor());
	if (url.pathname === "/api/auth/session") return Response.json(createGuiAuthSessionState());
	const distDir = options.distDir ?? defaultGuiDistDir();
	let pathname = decodeURIComponent(url.pathname);
	if (pathname === "/") pathname = "/index.html";
	const candidate = resolve(distDir, `.${pathname}`);
	if (!candidate.startsWith(resolve(distDir))) return new Response("Forbidden", { status: 403 });
	const filePath = existsSync(candidate) ? candidate : join(distDir, "index.html");
	if (!existsSync(filePath)) return undefined;
	return new Response(Bun.file(filePath), {
		headers: { "content-type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream" },
	});
}
