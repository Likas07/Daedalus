#!/usr/bin/env bun

import { constants } from "node:fs";
import { access, cp, lstat, mkdir, readdir, readlink, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Command = "help" | "list" | "install";
type InstallMode = "copy" | "symlink";
type InstallScope = "global" | "project";

type Options = {
	command: Command;
	scope: InstallScope;
	projectPath: string;
	mode: InstallMode;
	force: boolean;
	dryRun: boolean;
};

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_ROOT = join(REPO_ROOT, "skills");
const SKILLS = ["writing-plans", "executing-plans", "finishing-a-development-branch"] as const;

function printHelp(): void {
	console.log(`daedalus-skills setup

Usage:
  bun run setup --help
  bun run setup list
  bun run setup install [--global | --project [path]] [--mode copy|symlink] [--force] [--dry-run]

Commands:
  help                       Show this help text.
  list                       List bundled skills and files.
  install                    Install all bundled skills.

Install targets:
  --global                   Install into ~/.daedalus/agent/skills.
  --project [path]           Install into <path>/.daedalus/skills. Defaults to the current directory.

Install options:
  --mode copy                Copy skill directories into the target.
  --mode symlink             Symlink target directories back to this repository. Default.
  --copy                     Alias for --mode copy.
  --symlink                  Alias for --mode symlink.
  --force                    Replace existing target skill directories or symlinks.
  --dry-run                  Print actions without writing files.

Examples:
  bun run setup list
  bun run setup install --project /repo/path --mode symlink
  bun run setup install --project . --mode copy --force
  bun run setup install --global --mode symlink --dry-run`);
}

function readOptionValue(args: string[], index: number, option: string): string {
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`${option} requires a value.`);
	}
	return value;
}

function parseArgs(args: string[]): Options {
	let command: Command = "install";
	let scope: InstallScope = "project";
	let projectPath = process.cwd();
	let mode: InstallMode = "symlink";
	let force = false;
	let dryRun = false;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === "--help" || arg === "-h" || arg === "help") {
			command = "help";
			continue;
		}

		if (arg === "list") {
			command = "list";
			continue;
		}

		if (arg === "install") {
			command = "install";
			continue;
		}

		if (arg === "--global") {
			scope = "global";
			continue;
		}

		if (arg === "--project") {
			scope = "project";
			const next = args[index + 1];
			if (next && !next.startsWith("--")) {
				projectPath = next;
				index += 1;
			}
			continue;
		}

		if (arg === "--mode") {
			const value = readOptionValue(args, index, "--mode");
			if (value !== "copy" && value !== "symlink") {
				throw new Error(`Unsupported --mode ${value}. Use copy or symlink.`);
			}
			mode = value;
			index += 1;
			continue;
		}

		if (arg === "--copy") {
			mode = "copy";
			continue;
		}

		if (arg === "--symlink") {
			mode = "symlink";
			continue;
		}

		if (arg === "--force") {
			force = true;
			continue;
		}

		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return {
		command,
		scope,
		projectPath: resolve(projectPath),
		mode,
		force,
		dryRun,
	};
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

function installRoot(options: Options): string {
	if (options.scope === "global") {
		return join(homedir(), ".daedalus", "agent", "skills");
	}

	return join(options.projectPath, ".daedalus", "skills");
}

async function listSkills(): Promise<void> {
	for (const skill of SKILLS) {
		const skillRoot = join(SKILLS_ROOT, skill);
		const files = await readdir(skillRoot);
		console.log(`${skill}:`);
		for (const file of files.toSorted()) {
			console.log(`  - ${file}`);
		}
	}
}

async function describeExisting(path: string): Promise<string> {
	const stat = await lstat(path);
	if (stat.isSymbolicLink()) {
		return `symlink -> ${await readlink(path)}`;
	}
	if (stat.isDirectory()) {
		return "directory";
	}
	return "file";
}

async function install(options: Options): Promise<void> {
	const targetRoot = installRoot(options);
	console.log(`Installing ${SKILLS.length} skills to ${targetRoot}`);
	console.log(`Mode: ${options.mode}${options.force ? ", force" : ""}${options.dryRun ? ", dry-run" : ""}`);

	if (!options.dryRun) {
		await mkdir(targetRoot, { recursive: true });
	}

	for (const skill of SKILLS) {
		const source = join(SKILLS_ROOT, skill);
		const target = join(targetRoot, skill);
		const relativeSource = relative(dirname(target), source);

		if (!(await pathExists(source))) {
			throw new Error(`Missing bundled skill: ${source}`);
		}

		if (await pathExists(target)) {
			const existing = await describeExisting(target);
			if (!options.force) {
				throw new Error(`${target} already exists (${existing}). Re-run with --force to replace it.`);
			}

			console.log(`replace ${target} (${existing})`);
			if (!options.dryRun) {
				await rm(target, { recursive: true, force: true });
			}
		}

		if (options.mode === "copy") {
			console.log(`copy ${source} -> ${target}`);
			if (!options.dryRun) {
				await cp(source, target, { recursive: true, errorOnExist: true });
			}
		} else {
			console.log(`symlink ${target} -> ${relativeSource}`);
			if (!options.dryRun) {
				await symlink(relativeSource, target, "dir");
			}
		}
	}
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));

	if (options.command === "help") {
		printHelp();
		return;
	}

	if (options.command === "list") {
		await listSkills();
		return;
	}

	await install(options);
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Error: ${message}`);
	process.exitCode = 1;
});
