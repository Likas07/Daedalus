import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const guiSrcRoot = join(repoRoot, "packages/gui/src");

const forbiddenTokens = [
	"/home/likas/Research/gui-inspiration/t3code",
	"third_party/t3code-upstream",
	"apps/server",
	'from "electron"',
	"from '@daedalus-pi/app-server/",
	'from "@daedalus-pi/app-server/',
] as const;

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".cts", ".cjs", ".svelte"]);

type Offender = {
	path: string;
	line: number;
	token: string;
	text: string;
};

function hasSourceExtension(path: string): boolean {
	return [...sourceExtensions].some((extension) => path.endsWith(extension));
}

function isTestFile(path: string): boolean {
	return /(?:^|[./-])(test|spec)\.[cm]?[jt]sx?$/.test(path);
}

async function collectSourceFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				return collectSourceFiles(path);
			}
			if (entry.isFile() && hasSourceExtension(path) && !isTestFile(path)) {
				return [path];
			}
			return [];
		}),
	);
	return files.flat();
}

function findOffenders(path: string, source: string): Offender[] {
	const relativePath = relative(repoRoot, path);
	return source.split(/\r?\n/).flatMap((text, index) =>
		forbiddenTokens
			.filter((token) => text.includes(token))
			.map((token) => ({
				path: relativePath,
				line: index + 1,
				token,
				text: text.trim(),
			})),
	);
}

const sourceFiles = await collectSourceFiles(guiSrcRoot);
const offenders = (
	await Promise.all(sourceFiles.map(async (path) => findOffenders(path, await readFile(path, "utf8"))))
).flat();

if (offenders.length > 0) {
	console.error("GUI import boundary violations found:");
	for (const offender of offenders) {
		console.error(`${offender.path}:${offender.line} contains ${JSON.stringify(offender.token)}: ${offender.text}`);
	}
	process.exit(1);
}

console.log("GUI import boundaries OK");
