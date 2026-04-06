import path from "node:path";
import process from "node:process";

import { $env } from "@oh-my-pi/pi-utils";

interface OmpCommand {
	cmd: string;
	args: string[];
	shell: boolean;
}

const DEFAULT_CMD = process.platform === "win32" ? "daedalus.cmd" : "daedalus";
const DEFAULT_SHELL = process.platform === "win32";
const SELF_COMMAND_NAMES = new Set(["daedalus", "dae", "omp", "daedalus.cmd", "dae.cmd", "omp.cmd"]);

export function resolveOmpCommand(): OmpCommand {
	const envCmd = $env.PI_SUBPROCESS_CMD;
	if (envCmd?.trim()) {
		return { cmd: envCmd, args: [], shell: DEFAULT_SHELL };
	}

	const entry = process.argv[1];
	if (entry && (entry.endsWith(".ts") || entry.endsWith(".js"))) {
		return { cmd: process.execPath, args: [entry], shell: false };
	}
	if (entry && SELF_COMMAND_NAMES.has(path.basename(entry).toLowerCase())) {
		return { cmd: entry, args: [], shell: false };
	}

	return { cmd: DEFAULT_CMD, args: [], shell: DEFAULT_SHELL };
}
