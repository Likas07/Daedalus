import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");

const packageRoots = [
	{ name: "gui-core", path: resolve(repoRoot, "packages/gui-core") },
	{ name: "gui-components", path: resolve(repoRoot, "packages/gui-components") },
	{ name: "react-gui", path: resolve(repoRoot, "packages/react-gui") },
] as const;

export type ImportBoundaryRule =
	| "t3-quarantine"
	| "t3-runtime-provider-server"
	| "shell-process-api"
	| "electron-mutation-api"
	| "gui-core-react-free";

export interface ImportBoundaryViolation {
	readonly packageName: string;
	readonly relativePath: string;
	readonly rule: ImportBoundaryRule;
	readonly detail: string;
}

export interface SourceCheckInput {
	readonly packageName: string;
	readonly relativePath: string;
	readonly source: string;
}

const importSpecifierPattern =
	/(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\s*\(\s*["']([^"']+)["']\s*\)/g;

const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);

const skippedPathFragments = [`${sep}test${sep}`, ".test.", ".spec."];

function normalizeSpecifier(specifier: string): string {
	return specifier.replaceAll("\\", "/");
}

function isSourceFile(path: string): boolean {
	for (const extension of sourceExtensions) {
		if (path.endsWith(extension) || path.endsWith(`${extension}x`)) return true;
	}
	return false;
}

function shouldSkipFile(path: string): boolean {
	return skippedPathFragments.some((fragment) => path.includes(fragment));
}

function collectImportSpecifiers(source: string): string[] {
	const specifiers: string[] = [];
	for (const match of source.matchAll(importSpecifierPattern)) {
		const specifier = match[1] ?? match[2] ?? match[3];
		if (specifier) specifiers.push(specifier);
	}
	return specifiers;
}

function hasT3RuntimeProviderServerPattern(specifier: string): boolean {
	const normalized = normalizeSpecifier(specifier);
	if (normalized.startsWith("@daedalus-pi/")) return false;
	if (normalized === "server-only" || normalized === "client-only") return true;
	if (normalized.startsWith("@trpc/server")) return true;
	if (/^(@|~|#)?\/?(server|runtime|providers?)(\/|$)/.test(normalized)) return true;
	if (/(^|\/)src\/(server|runtime|providers?)(\/|$)/.test(normalized)) return true;
	if (/(^|\/)(server|runtime|providers?)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(normalized)) return true;
	return false;
}

function pushSpecifierViolations(
	input: SourceCheckInput,
	specifier: string,
	violations: ImportBoundaryViolation[],
): void {
	const normalized = normalizeSpecifier(specifier);

	if (normalized.includes("third_party/t3code-upstream") || normalized.includes("t3code-upstream")) {
		violations.push({
			packageName: input.packageName,
			relativePath: input.relativePath,
			rule: "t3-quarantine",
			detail: `Forbidden quarantined T3 import: ${specifier}`,
		});
	}

	if (hasT3RuntimeProviderServerPattern(specifier)) {
		violations.push({
			packageName: input.packageName,
			relativePath: input.relativePath,
			rule: "t3-runtime-provider-server",
			detail: `Forbidden T3-style runtime/provider/server import: ${specifier}`,
		});
	}

	if (
		["child_process", "node:child_process", "process", "node:process", "execa", "shelljs", "zx"].includes(specifier)
	) {
		violations.push({
			packageName: input.packageName,
			relativePath: input.relativePath,
			rule: "shell-process-api",
			detail: `Forbidden direct shell/process import in browser-facing GUI code: ${specifier}`,
		});
	}

	if (specifier === "electron" || specifier === "@electron/remote" || normalized.startsWith("electron/")) {
		violations.push({
			packageName: input.packageName,
			relativePath: input.relativePath,
			rule: "electron-mutation-api",
			detail: `Forbidden Electron API import in browser-facing GUI code: ${specifier}`,
		});
	}

	if (
		input.packageName === "gui-core" &&
		(specifier === "react" || specifier === "react-dom" || normalized.startsWith("react/"))
	) {
		violations.push({
			packageName: input.packageName,
			relativePath: input.relativePath,
			rule: "gui-core-react-free",
			detail: `gui-core must remain React-free: ${specifier}`,
		});
	}
}

function pushSourcePatternViolations(input: SourceCheckInput, violations: ImportBoundaryViolation[]): void {
	const sourcePatterns: Array<{ rule: ImportBoundaryRule; pattern: RegExp; detail: string }> = [
		{
			rule: "shell-process-api",
			pattern: /\bBun\s*\.\s*(spawn|spawnSync|\$)\b|\bprocess\s*\./,
			detail: "Forbidden direct Bun/process shell API usage in browser-facing GUI code",
		},
		{
			rule: "electron-mutation-api",
			pattern:
				/\bipcRenderer\s*\.\s*(send|sendSync|invoke)\b|\bshell\s*\.\s*openExternal\b|\bBrowserWindow\b|\bsession\s*\.\s*defaultSession\b/,
			detail: "Forbidden Electron mutation API usage in browser-facing GUI code",
		},
	];

	for (const sourcePattern of sourcePatterns) {
		if (!sourcePattern.pattern.test(input.source)) continue;
		violations.push({
			packageName: input.packageName,
			relativePath: input.relativePath,
			rule: sourcePattern.rule,
			detail: sourcePattern.detail,
		});
	}
}

export function checkImportBoundarySource(input: SourceCheckInput): ImportBoundaryViolation[] {
	const violations: ImportBoundaryViolation[] = [];
	for (const specifier of collectImportSpecifiers(input.source)) {
		pushSpecifierViolations(input, specifier, violations);
	}
	pushSourcePatternViolations(input, violations);
	return violations;
}

async function collectSourceFiles(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const entryPath = resolve(root, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist") continue;
			files.push(...(await collectSourceFiles(entryPath)));
			continue;
		}

		if (entry.isFile() && isSourceFile(entryPath) && !shouldSkipFile(entryPath)) files.push(entryPath);
	}

	return files;
}

export async function checkReactGuiImportBoundaries(): Promise<ImportBoundaryViolation[]> {
	const violations: ImportBoundaryViolation[] = [];

	for (const packageRoot of packageRoots) {
		const files = await collectSourceFiles(packageRoot.path);
		for (const file of files) {
			const source = await readFile(file, "utf8");
			violations.push(
				...checkImportBoundarySource({
					packageName: packageRoot.name,
					relativePath: relative(packageRoot.path, file),
					source,
				}),
			);
		}
	}

	return violations;
}

function formatViolation(violation: ImportBoundaryViolation): string {
	return `${violation.packageName}/${violation.relativePath}: ${violation.rule}: ${violation.detail}`;
}

if (import.meta.main) {
	const violations = await checkReactGuiImportBoundaries();
	if (violations.length > 0) {
		console.error("React GUI import-boundary violations:");
		for (const violation of violations) console.error(`- ${formatViolation(violation)}`);
		process.exit(1);
	}
	console.log("React GUI import-boundary check passed.");
}
