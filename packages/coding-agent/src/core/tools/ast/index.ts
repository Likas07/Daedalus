export {
	type AstWorkspace,
	applyAstReplacementGroups,
	createTempAstWorkspace,
	finalizeAstWorkspace,
} from "./apply.js";
export { createDefaultAstBackend, createSgCliBackend } from "./backend.js";
export { formatAstEditPreview, formatAstSearchResults, summarizeAstMatches } from "./render.js";
export type * from "./types.js";
export {
	normalizeNonNegativeInt,
	normalizePatterns,
	normalizePositiveInt,
	normalizeRewriteOps,
	resolveAstScope,
} from "./validation.js";
