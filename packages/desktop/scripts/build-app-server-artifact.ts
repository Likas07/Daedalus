import { chmod, copyFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const desktopRoot = resolve(import.meta.dir, "..");
const repoRoot = resolve(desktopRoot, "..", "..");
const resourcesDir = join(desktopRoot, "resources", "app-server");
const binaryName = process.platform === "win32" ? "daedalus-app-server.exe" : "daedalus-app-server";
const binaryPath = join(resourcesDir, binaryName);
const sourceMain = join(repoRoot, "packages", "app-server", "src", "server", "main.ts");
const fallbackMain = join(resourcesDir, "main.ts");

async function buildCompiledServer(): Promise<boolean> {
	const proc = Bun.spawn({
		cmd: ["bun", "build", sourceMain, "--compile", "--outfile", binaryPath],
		cwd: repoRoot,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
	if (exitCode === 0) {
		if (process.platform !== "win32") await chmod(binaryPath, 0o755);
		return true;
	}
	console.warn("Bun compile for app-server failed; staging Bun script fallback instead.");
	if (stdout.trim()) console.warn(stdout.trim());
	if (stderr.trim()) console.warn(stderr.trim());
	return false;
}

await rm(resourcesDir, { recursive: true, force: true });
await mkdir(resourcesDir, { recursive: true });

if (!(await buildCompiledServer())) {
	await copyFile(sourceMain, fallbackMain);
}
