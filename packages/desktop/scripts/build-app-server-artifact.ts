import { chmod, copyFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const desktopRoot = resolve(import.meta.dir, "..");
const repoRoot = resolve(desktopRoot, "..", "..");
const resourcesDir = join(desktopRoot, "resources", "app-server");
const binaryName = process.platform === "win32" ? "daedalus-app-server.exe" : "daedalus-app-server";
const binaryPath = join(resourcesDir, binaryName);
const sourceMain = join(repoRoot, "packages", "app-server", "src", "server", "main.ts");
const fallbackMain = join(resourcesDir, "main.ts");
const allowFallback = process.argv.includes("--allow-fallback") || process.env.DAEDALUS_APP_SERVER_ALLOW_FALLBACK === "1";

async function buildCompiledServer(): Promise<boolean> {
	const proc = Bun.spawn({
		cmd: ["bun", "build", sourceMain, "--compile", "--outfile", binaryPath],
		cwd: repoRoot,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exitCode === 0) {
		if (process.platform !== "win32") await chmod(binaryPath, 0o755);
		return true;
	}
	const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
	const message = `Bun compile for app-server failed${output ? `:\n${output}` : "."}`;
	if (!allowFallback) {
		throw new Error(
			`${message}\nRelease desktop packaging requires a compiled app-server binary. Re-run with --allow-fallback or DAEDALUS_APP_SERVER_ALLOW_FALLBACK=1 only for dev/test packaging.`,
		);
	}
	console.warn(`${message}\nStaging Bun script fallback because fallback was explicitly allowed.`);
	return false;
}

await rm(resourcesDir, { recursive: true, force: true });
await mkdir(resourcesDir, { recursive: true });

if (!(await buildCompiledServer())) {
	await copyFile(sourceMain, fallbackMain);
}
