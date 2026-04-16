export const BUILTIN_TOOL_ORDER = [
	"read",
	"bash",
	"edit",
	"hashline_edit",
	"fetch",
	"ast_grep",
	"ast_edit",
	"write",
	"grep",
	"find",
	"ls",
] as const;

export type ToolName = (typeof BUILTIN_TOOL_ORDER)[number];

export const DEFAULT_ACTIVE_TOOL_NAMES = [
	"read",
	"bash",
	"hashline_edit",
	"fetch",
	"ast_grep",
	"ast_edit",
	"write",
	"grep",
	"find",
	"ls",
] as const satisfies readonly ToolName[];

export const READ_ONLY_TOOL_NAMES = ["read", "grep", "find", "ls"] as const satisfies readonly ToolName[];
