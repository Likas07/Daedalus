#!/usr/bin/env bun

import path from "node:path";
import {
	DEFAULT_OLLAMA_EMBED_MODEL,
	DEFAULT_OLLAMA_HOST,
	type SemanticIndexProfile,
} from "../extensions/semantic-search/semantic-config.js";
import {
	type SemanticWorkspaceSyncOptions,
	syncSemanticWorkspace,
} from "../extensions/semantic-search/semantic-workspace.js";
import { SemanticWorkspaceTerminalProgressRenderer } from "../extensions/semantic-search/semantic-workspace-progress.js";

interface WorkspaceSyncCliOptions extends SemanticWorkspaceSyncOptions {
	cwd: string;
	help?: boolean;
}

function printHelp(): void {
	process.stdout.write(`workspace-sync — sync the Daedalus semantic workspace index

Usage:
  workspace-sync [path] [--host URL] [--model NAME] [--profile minimal|normal|broad|exhaustive] [--no-restart]

Options:
  --host, --embedding-host     Ollama host to use for embeddings (default: project setting or ${DEFAULT_OLLAMA_HOST})
  --model, --embedding-model   Ollama embedding model (default: project setting or ${DEFAULT_OLLAMA_EMBED_MODEL})
  --profile, --index-profile   Semantic index profile: minimal, normal, broad, exhaustive
  --no-restart                 Do not run 'ollama stop <model>' before syncing
  --restart                    Restart the embedding model before syncing (default)
  -h, --help                   Show this help

The command writes semantic state under the target workspace's .daedalus/ directory.
`);
}

function readValue(args: string[], index: number, flag: string): { value: string; nextIndex: number } {
	const inline = flag.includes("=") ? flag.split("=", 2)[1] : undefined;
	if (inline) return { value: inline, nextIndex: index };
	const value = args[index + 1];
	if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
	return { value, nextIndex: index + 1 };
}

function parseProfile(value: string): SemanticIndexProfile {
	if (value === "minimal" || value === "normal" || value === "broad" || value === "exhaustive") return value;
	throw new Error(`Unsupported profile '${value}'. Expected minimal, normal, broad, or exhaustive.`);
}

function parseArgs(argv: string[]): WorkspaceSyncCliOptions {
	const options: WorkspaceSyncCliOptions = { cwd: process.cwd(), restartEmbeddingModel: true };
	const positional: string[] = [];
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "-h" || arg === "--help") {
			options.help = true;
			continue;
		}
		if (arg === "--no-restart") {
			options.restartEmbeddingModel = false;
			continue;
		}
		if (arg === "--restart") {
			options.restartEmbeddingModel = true;
			continue;
		}
		if (arg.startsWith("--host") || arg.startsWith("--embedding-host")) {
			const result = readValue(argv, index, arg);
			options.embeddingHost = result.value;
			index = result.nextIndex;
			continue;
		}
		if (arg.startsWith("--model") || arg.startsWith("--embedding-model")) {
			const result = readValue(argv, index, arg);
			options.embeddingModel = result.value;
			index = result.nextIndex;
			continue;
		}
		if (arg.startsWith("--profile") || arg.startsWith("--index-profile")) {
			const result = readValue(argv, index, arg);
			options.indexProfile = parseProfile(result.value);
			index = result.nextIndex;
			continue;
		}
		if (arg.startsWith("--")) throw new Error(`Unknown option '${arg}'`);
		positional.push(arg);
	}
	if (positional.length > 1) throw new Error(`Expected at most one workspace path, got ${positional.length}.`);
	if (positional[0]) options.cwd = path.resolve(positional[0]);
	return options;
}

function collectErrorMessages(error: unknown): string[] {
	const messages: string[] = [];
	let current: unknown = error;
	while (current) {
		if (current instanceof Error) {
			messages.push(current.message);
			current = current.cause;
		} else {
			messages.push(String(current));
			break;
		}
	}
	return messages;
}

function formatFailure(error: unknown, options: WorkspaceSyncCliOptions): string {
	const messages = collectErrorMessages(error);
	const message = messages.join("\nCaused by: ");
	const combined = messages.join("\n").toLowerCase();
	const host = options.embeddingHost ?? DEFAULT_OLLAMA_HOST;
	const model = options.embeddingModel ?? DEFAULT_OLLAMA_EMBED_MODEL;
	const ollamaHint =
		combined.includes("ollama") ||
		combined.includes("econnrefused") ||
		combined.includes("connection refused") ||
		combined.includes("fetch failed") ||
		combined.includes("timed out")
			? `\n\nOllama embedding check: make sure Ollama is running and reachable at ${host}, and that model '${model}' is pulled and available (for example: ollama pull ${model}).`
			: "";
	return `workspace-sync failed: ${message}${ollamaHint}\n`;
}

async function main(): Promise<void> {
	const options = parseArgs(Bun.argv.slice(2));
	if (options.help) {
		printHelp();
		return;
	}
	const renderer = new SemanticWorkspaceTerminalProgressRenderer("sync");
	try {
		process.stdout.write(`Syncing semantic workspace: ${options.cwd}\n`);
		await syncSemanticWorkspace(options.cwd, (progress) => renderer.render(progress), options);
		renderer.finish();
	} catch (error) {
		renderer.finish();
		process.stderr.write(formatFailure(error, options));
		process.exitCode = 1;
	}
}

await main();
