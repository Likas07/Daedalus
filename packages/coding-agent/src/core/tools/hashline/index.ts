export {
	HASHLINE_DICT,
	HASHLINE_NIBBLE_ALPHABET,
	HASHLINE_OUTPUT_RE,
	HASHLINE_REF_RE,
} from "./constants.js";
export { applyHashlineEditsToNormalizedContent, HashlineMismatchError } from "./edit-operations.js";
export { computeLineHash, formatHashLines, formatLineTag } from "./hash-computation.js";
export { stripHashlinePrefixes, stripNewLinePrefixes } from "./prefix-stripping.js";
export type {
	HashlineAnchor,
	HashlineApplyResult,
	HashlineEditOperation,
	HashlineMismatch,
} from "./types.js";
export { normalizeTag, parseTag, validateTag, validateTags } from "./validation.js";

export { buildCompactHashlineDiffPreview } from "./diff-preview.js";
export type { CompactHashlineDiffOptions, CompactHashlineDiffPreview } from "./diff-preview.js";

export {
	hashlineEditEntrySchema,
	hashlineEditSchema,
	normalizeHashlineBulkInput,
} from "./bulk-input.js";
export type {
	HashlineEditToolInput,
	HashlineFileOp,
	NormalizedHashlineFileBatch,
	RawHashlineEditEntry,
} from "./bulk-input.js";