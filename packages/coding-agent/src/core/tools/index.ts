export {
	type AstEditOperations,
	type AstEditToolDetails,
	type AstEditToolInput,
	type AstEditToolOptions,
	astEditTool,
	astEditToolDefinition,
	createAstEditTool,
	createAstEditToolDefinition,
} from "./ast-edit.js";
export {
	type AstGrepToolDetails,
	type AstGrepToolInput,
	type AstGrepToolOptions,
	astGrepTool,
	astGrepToolDefinition,
	createAstGrepTool,
	createAstGrepToolDefinition,
} from "./ast-grep.js";
export {
	type BashOperations,
	type BashSpawnContext,
	type BashSpawnHook,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	bashTool,
	bashToolDefinition,
	createBashTool,
	createBashToolDefinition,
	createLocalBashOperations,
} from "./bash.js";
export type { ToolName } from "./defaults.js";
export {
	createEditTool,
	createEditToolDefinition,
	type EditOperations,
	type EditToolDetails,
	type EditToolInput,
	type EditToolOptions,
	editTool,
	editToolDefinition,
} from "./edit.js";
export {
	createFetchTool,
	createFetchToolDefinition,
	type FetchToolDetails,
	type FetchToolInput,
	type FetchToolOptions,
	fetchTool,
	fetchToolDefinition,
} from "./fetch.js";
export { withFileMutationQueue } from "./file-mutation-queue.js";
export {
	createFindTool,
	createFindToolDefinition,
	type FindOperations,
	type FindToolDetails,
	type FindToolInput,
	type FindToolOptions,
	findTool,
	findToolDefinition,
} from "./find.js";
export {
	createGrepTool,
	createGrepToolDefinition,
	type GrepOperations,
	type GrepToolDetails,
	type GrepToolInput,
	type GrepToolOptions,
	grepTool,
	grepToolDefinition,
} from "./grep.js";
export {
	createHashlineEditTool,
	createHashlineEditToolDefinition,
	type HashlineEditEntry,
	type HashlineEditOperations,
	type HashlineEditToolDetails,
	type HashlineEditToolInput,
	type HashlineEditToolOptions,
	hashlineEditTool,
	hashlineEditToolDefinition,
} from "./hashline-edit.js";
export {
	createLsTool,
	createLsToolDefinition,
	type LsOperations,
	type LsToolDetails,
	type LsToolInput,
	type LsToolOptions,
	lsTool,
	lsToolDefinition,
} from "./ls.js";
export {
	createReadTool,
	createReadToolDefinition,
	type ReadOperations,
	type ReadToolDetails,
	type ReadToolInput,
	type ReadToolOptions,
	readTool,
	readToolDefinition,
} from "./read.js";
export {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	type TruncationOptions,
	type TruncationResult,
	truncateHead,
	truncateLine,
	truncateTail,
} from "./truncate.js";
export {
	createWriteTool,
	createWriteToolDefinition,
	type WriteOperations,
	type WriteToolInput,
	type WriteToolOptions,
	writeTool,
	writeToolDefinition,
} from "./write.js";

import type { AgentTool } from "@daedalus-pi/agent-core";
import type { ToolDefinition } from "../extensions/types.js";
import { astEditTool, astEditToolDefinition, createAstEditTool, createAstEditToolDefinition } from "./ast-edit.js";
import { astGrepTool, astGrepToolDefinition, createAstGrepTool, createAstGrepToolDefinition } from "./ast-grep.js";
import {
	type BashToolOptions,
	bashTool,
	bashToolDefinition,
	createBashTool,
	createBashToolDefinition,
} from "./bash.js";
import { DEFAULT_ACTIVE_TOOL_NAMES, READ_ONLY_TOOL_NAMES, type ToolName } from "./defaults.js";
import { createEditTool, createEditToolDefinition, editTool, editToolDefinition } from "./edit.js";
import { createFetchTool, createFetchToolDefinition, fetchTool, fetchToolDefinition } from "./fetch.js";
import { createFindTool, createFindToolDefinition, findTool, findToolDefinition } from "./find.js";
import { createGrepTool, createGrepToolDefinition, grepTool, grepToolDefinition } from "./grep.js";
import {
	createHashlineEditTool,
	createHashlineEditToolDefinition,
	hashlineEditTool,
	hashlineEditToolDefinition,
} from "./hashline-edit.js";
import { createLsTool, createLsToolDefinition, lsTool, lsToolDefinition } from "./ls.js";
import {
	createReadTool,
	createReadToolDefinition,
	type ReadToolOptions,
	readTool,
	readToolDefinition,
} from "./read.js";
import { createWriteTool, createWriteToolDefinition, writeTool, writeToolDefinition } from "./write.js";

export type Tool = AgentTool<any>;
export type ToolDef = ToolDefinition<any, any>;

function selectToolsByName<T>(registry: Record<ToolName, T>, names: readonly ToolName[]): T[] {
	return names.map((name) => registry[name]);
}

export const allTools: Record<ToolName, Tool> = {
	read: readTool,
	bash: bashTool,
	edit: editTool,
	hashline_edit: hashlineEditTool,
	fetch: fetchTool,
	ast_grep: astGrepTool,
	ast_edit: astEditTool,
	write: writeTool,
	grep: grepTool,
	find: findTool,
	ls: lsTool,
};

export const allToolDefinitions: Record<ToolName, ToolDef> = {
	read: readToolDefinition,
	bash: bashToolDefinition,
	edit: editToolDefinition,
	hashline_edit: hashlineEditToolDefinition,
	fetch: fetchToolDefinition,
	ast_grep: astGrepToolDefinition,
	ast_edit: astEditToolDefinition,
	write: writeToolDefinition,
	grep: grepToolDefinition,
	find: findToolDefinition,
	ls: lsToolDefinition,
};

export const codingTools: Tool[] = selectToolsByName(allTools, DEFAULT_ACTIVE_TOOL_NAMES);
export const readOnlyTools: Tool[] = selectToolsByName(allTools, READ_ONLY_TOOL_NAMES);

export interface ToolsOptions {
	read?: ReadToolOptions;
	bash?: BashToolOptions;
}

export function createCodingToolDefinitions(cwd: string, options?: ToolsOptions): ToolDef[] {
	return selectToolsByName(createAllToolDefinitions(cwd, options), DEFAULT_ACTIVE_TOOL_NAMES);
}

export function createReadOnlyToolDefinitions(cwd: string, options?: ToolsOptions): ToolDef[] {
	return selectToolsByName(createAllToolDefinitions(cwd, options), READ_ONLY_TOOL_NAMES);
}

export function createAllToolDefinitions(cwd: string, options?: ToolsOptions): Record<ToolName, ToolDef> {
	return {
		read: createReadToolDefinition(cwd, options?.read),
		bash: createBashToolDefinition(cwd, options?.bash),
		edit: createEditToolDefinition(cwd),
		hashline_edit: createHashlineEditToolDefinition(cwd),
		fetch: createFetchToolDefinition(cwd),
		ast_grep: createAstGrepToolDefinition(cwd),
		ast_edit: createAstEditToolDefinition(cwd),
		write: createWriteToolDefinition(cwd),
		grep: createGrepToolDefinition(cwd),
		find: createFindToolDefinition(cwd),
		ls: createLsToolDefinition(cwd),
	};
}

export function createCodingTools(cwd: string, options?: ToolsOptions): Tool[] {
	return selectToolsByName(createAllTools(cwd, options), DEFAULT_ACTIVE_TOOL_NAMES);
}

export function createReadOnlyTools(cwd: string, options?: ToolsOptions): Tool[] {
	return selectToolsByName(createAllTools(cwd, options), READ_ONLY_TOOL_NAMES);
}

export function createAllTools(cwd: string, options?: ToolsOptions): Record<ToolName, Tool> {
	return {
		read: createReadTool(cwd, options?.read),
		bash: createBashTool(cwd, options?.bash),
		edit: createEditTool(cwd),
		hashline_edit: createHashlineEditTool(cwd),
		fetch: createFetchTool(cwd),
		ast_grep: createAstGrepTool(cwd),
		ast_edit: createAstEditTool(cwd),
		write: createWriteTool(cwd),
		grep: createGrepTool(cwd),
		find: createFindTool(cwd),
		ls: createLsTool(cwd),
	};
}
