/**
 * Tools Configuration
 *
 * Use built-in tool sets or individual tools.
 *
 * IMPORTANT: When using a custom `cwd`, you must use the tool factory functions
 * (createCodingTools, createReadOnlyTools, createReadTool, etc.) to ensure
 * tools resolve paths relative to your cwd, not process.cwd().
 *
 * For custom tools, see 06-extensions.ts - custom tools are now registered
 * via the extensions system using pi.registerTool().
 */

import {
	astEditTool,
	astGrepTool,
	bashTool,
	createAgentSession,
	createAstEditTool,
	createAstGrepTool,
	createBashTool,
	createCodingTools,
	createFetchTool,
	createGrepTool,
	createHashlineEditTool,
	createReadTool,
	fetchTool,
	grepTool,
	hashlineEditTool,
	readOnlyTools,
	readTool,
	SessionManager,
} from "@daedalus-pi/coding-agent";

// Read-only mode (no edit/write) - uses process.cwd()
await createAgentSession({
	tools: readOnlyTools,
	sessionManager: SessionManager.inMemory(),
});
console.log("Read-only session created");

// Custom tool selection - uses process.cwd()
await createAgentSession({
	tools: [readTool, bashTool, grepTool],
	sessionManager: SessionManager.inMemory(),
});
console.log("Custom tools session created");

// codingTools already includes hashline_edit, fetch, ast_grep, and ast_edit by default. Exact-text edit remains available separately.
// hashline_edit calls use: { edits: [{ path, op: "replace" | "append" | "prepend" | "delete" | "move", pos?, end?, lines?, to? }] }.
await createAgentSession({
	tools: [readTool, hashlineEditTool],
	sessionManager: SessionManager.inMemory(),
});
console.log("Hashline tools session created");

await createAgentSession({
	tools: [readTool, fetchTool, astGrepTool, astEditTool],
	sessionManager: SessionManager.inMemory(),
});
console.log("Fetch/AST tools session created");

// With custom cwd - MUST use factory functions!
const customCwd = "/path/to/project";
await createAgentSession({
	cwd: customCwd,
	tools: createCodingTools(customCwd), // Tools resolve paths relative to customCwd
	sessionManager: SessionManager.inMemory(),
});
console.log("Custom cwd session created");

// Or pick specific tools for custom cwd
await createAgentSession({
	cwd: customCwd,
	tools: [createReadTool(customCwd), createBashTool(customCwd), createGrepTool(customCwd)],
	sessionManager: SessionManager.inMemory(),
});
console.log("Specific tools with custom cwd session created");

await createAgentSession({
	cwd: customCwd,
	tools: [createReadTool(customCwd), createHashlineEditTool(customCwd)],
	sessionManager: SessionManager.inMemory(),
});
console.log("Specific hashline tools with custom cwd session created");

await createAgentSession({
	cwd: customCwd,
	tools: [
		createReadTool(customCwd),
		createFetchTool(customCwd),
		createAstGrepTool(customCwd),
		createAstEditTool(customCwd),
	],
	sessionManager: SessionManager.inMemory(),
});
console.log("Specific fetch/AST tools with custom cwd session created");
