export type ReaderMessageRole = "user" | "assistant" | "system" | "tool" | string;

export interface ReaderMessage {
	role: ReaderMessageRole;
	content: string;
	id?: string;
	title?: string;
}

export interface ReaderModelInput {
	transcript?: string;
	response?: string;
	messages?: ReaderMessage[];
	expandAll?: boolean;
}

export interface ReaderLine {
	index: number;
	text: string;
	source: "transcript" | "response" | "message";
	messageIndex?: number;
	role?: ReaderMessageRole;
}

export interface ReaderAnchor {
	index: number;
	lineIndex: number;
	label: string;
	type: "heading" | "message";
	level?: number;
	role?: ReaderMessageRole;
	messageIndex?: number;
}

export interface ReaderSearchMatch {
	index: number;
	lineIndex: number;
	column: number;
	query: string;
}

export interface ReaderModel {
	lines: ReaderLine[];
	headings: ReaderAnchor[];
	messageAnchors: ReaderAnchor[];
	anchors: ReaderAnchor[];
	expandAll: boolean;
}

function splitContent(content: string): string[] {
	return content.length === 0 ? [] : content.replace(/\r\n/g, "\n").split("\n");
}

function pushLine(lines: ReaderLine[], text: string, source: ReaderLine["source"], metadata: Partial<ReaderLine> = {}) {
	lines.push({ index: lines.length, text, source, ...metadata });
}

export function createReaderModel(input: ReaderModelInput): ReaderModel {
	const lines: ReaderLine[] = [];
	const headings: ReaderAnchor[] = [];
	const messageAnchors: ReaderAnchor[] = [];
	const addHeading = (lineIndex: number, text: string) => {
		const match = /^(#{1,6})\s+(.+)$/.exec(text.trim());
		if (!match) return;
		headings.push({ index: headings.length, lineIndex, label: match[2], type: "heading", level: match[1].length });
	};

	if (input.transcript) {
		for (const line of splitContent(input.transcript)) {
			pushLine(lines, line, "transcript");
			addHeading(lines.length - 1, line);
		}
	}
	if (input.response) {
		if (lines.length > 0) pushLine(lines, "", "response");
		for (const line of splitContent(input.response)) {
			pushLine(lines, line, "response");
			addHeading(lines.length - 1, line);
		}
	}
	for (const [messageIndex, message] of (input.messages ?? []).entries()) {
		if (lines.length > 0) pushLine(lines, "", "message", { messageIndex, role: message.role });
		const label = message.title ?? `${message.role}`;
		pushLine(lines, `## ${label}`, "message", { messageIndex, role: message.role });
		messageAnchors.push({
			index: messageAnchors.length,
			lineIndex: lines.length - 1,
			label,
			type: "message",
			role: message.role,
			messageIndex,
		});
		addHeading(lines.length - 1, `## ${label}`);
		for (const line of splitContent(message.content)) {
			pushLine(lines, line, "message", { messageIndex, role: message.role });
			addHeading(lines.length - 1, line);
		}
	}

	const anchors = [...headings, ...messageAnchors].sort((a, b) => a.lineIndex - b.lineIndex);
	return { lines, headings, messageAnchors, anchors, expandAll: input.expandAll ?? false };
}

export function findReaderSearchMatches(model: ReaderModel, query: string): ReaderSearchMatch[] {
	if (!query) return [];
	const needle = query.toLocaleLowerCase();
	const matches: ReaderSearchMatch[] = [];
	for (const line of model.lines) {
		const haystack = line.text.toLocaleLowerCase();
		let column = haystack.indexOf(needle);
		while (column !== -1) {
			matches.push({ index: matches.length, lineIndex: line.index, column, query });
			column = haystack.indexOf(needle, column + Math.max(1, needle.length));
		}
	}
	return matches;
}

export function nextReaderSearchMatch(
	matches: ReaderSearchMatch[],
	currentLine: number,
	direction: 1 | -1,
): ReaderSearchMatch | undefined {
	if (matches.length === 0) return undefined;
	if (direction > 0) return matches.find((match) => match.lineIndex > currentLine) ?? matches[0];
	for (let index = matches.length - 1; index >= 0; index--) {
		if (matches[index].lineIndex < currentLine) return matches[index];
	}
	return matches[matches.length - 1];
}

export function nextReaderAnchor(
	anchors: ReaderAnchor[],
	currentLine: number,
	direction: 1 | -1,
): ReaderAnchor | undefined {
	if (anchors.length === 0) return undefined;
	if (direction > 0) return anchors.find((anchor) => anchor.lineIndex > currentLine) ?? anchors[0];
	for (let index = anchors.length - 1; index >= 0; index--) {
		if (anchors[index].lineIndex < currentLine) return anchors[index];
	}
	return anchors[anchors.length - 1];
}
