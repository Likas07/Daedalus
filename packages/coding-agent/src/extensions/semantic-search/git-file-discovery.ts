import path from "node:path";

async function runGit(args: string[], cwd: string): Promise<string | undefined> {
	try {
		const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
		const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
		if (exitCode !== 0) return undefined;
		return stdout.trim();
	} catch {
		return undefined;
	}
}

export async function discoverViaGit(cwd: string): Promise<string[] | undefined> {
	const rootOutput = await runGit(["rev-parse", "--show-toplevel"], cwd);
	if (!rootOutput) return undefined;
	const repoRoot = path.resolve(rootOutput.split(/\r?\n/)[0]);
	const filesOutput = await runGit(["ls-files", "--full-name", "--cached", "--others", "--exclude-standard"], cwd);
	if (!filesOutput) return undefined;
	const files = filesOutput
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((file) => path.resolve(repoRoot, file))
		.sort((a, b) => a.localeCompare(b));
	return files.length > 0 ? files : undefined;
}
