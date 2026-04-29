#!/usr/bin/env bun
import { cp, lstat, mkdir, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
let mode: "symlink" | "copy" = "symlink";
let scope: "global" | "project" = "global";
let projectDir = process.cwd();
let target: string | undefined;
let force = false;

for (let index = 0; index < args.length; index += 1) {
	const arg = args[index];
	const next = () => {
		const value = args[index + 1];
		if (!value) throw new Error(`Missing value for ${arg}`);
		index += 1;
		return value;
	};
	if (arg === "--mode") mode = next() as typeof mode;
	else if (arg === "--scope") scope = next() as typeof scope;
	else if (arg === "--project-dir") projectDir = next();
	else if (arg === "--target") target = next();
	else if (arg === "--force") force = true;
	else if (arg === "--help" || arg === "-h") {
		console.log(`Usage: bun run setup -- [--mode symlink|copy] [--scope global|project] [--project-dir DIR] [--target DIR] [--force]`);
		process.exit(0);
	} else {
		throw new Error(`Unknown argument: ${arg}`);
	}
}

if (mode !== "symlink" && mode !== "copy") throw new Error("--mode must be symlink or copy");
if (scope !== "global" && scope !== "project") throw new Error("--scope must be global or project");

const source = resolve(import.meta.dir, "..");
const destination = resolve(
	target ?? (scope === "global" ? `${homedir()}/.daedalus/agent/extensions/asaas` : `${projectDir}/.daedalus/extensions/asaas`),
);

const existing = await lstat(destination).catch((error: NodeJS.ErrnoException) => {
	if (error.code === "ENOENT") return undefined;
	throw error;
});
if (existing) {
	if (!force) throw new Error(`${destination} already exists. Re-run with --force to replace it.`);
	await rm(destination, { recursive: true, force: true });
}

await mkdir(dirname(destination), { recursive: true });
if (mode === "copy") await cp(source, destination, { recursive: true, filter: (path) => !path.includes("/node_modules/") });
else await symlink(source, destination, "dir");

console.log(`${mode === "copy" ? "Copied" : "Symlinked"} Asaas extension to ${destination}`);
