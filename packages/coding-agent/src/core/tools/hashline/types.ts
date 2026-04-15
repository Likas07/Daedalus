export interface HashlineAnchor {
	line: number;
	hash: string;
}

export type HashlineEditOperation =
	| { op: "replace_line"; pos: HashlineAnchor; lines: string[] }
	| { op: "replace_range"; pos: HashlineAnchor; end: HashlineAnchor; lines: string[] }
	| { op: "append_at"; pos: HashlineAnchor; lines: string[] }
	| { op: "prepend_at"; pos: HashlineAnchor; lines: string[] }
	| { op: "append_file"; lines: string[] }
	| { op: "prepend_file"; lines: string[] };

export interface HashlineMismatch {
	line: number;
	expected: string;
	actual?: string;
}

export interface HashlineApplyResult {
	baseContent: string;
	newContent: string;
	firstChangedLine: number | undefined;
	warnings?: string[];
	noopEdits?: Array<{ editIndex: number; loc: string; current: string }>;
}
