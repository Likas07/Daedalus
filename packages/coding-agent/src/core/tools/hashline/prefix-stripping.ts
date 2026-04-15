const HASHLINE_PREFIX_RE = /^\s*(?:>>>|>>)?\s*(?:\+\s*)?(?:\d+\s*#\s*|#\s*)[ZPMQVRWSNKTXJBYH]{2}[:|]/;
const DIFF_PLUS_RE = /^[+](?![+])/;

export function stripHashlinePrefixes(lines: string[]): string[] {
	let prefixed = 0;
	let nonEmpty = 0;
	for (const line of lines) {
		if (line.length === 0) continue;
		nonEmpty++;
		if (HASHLINE_PREFIX_RE.test(line)) prefixed++;
	}
	if (nonEmpty === 0 || prefixed !== nonEmpty) return lines;
	return lines.map((line) => line.replace(HASHLINE_PREFIX_RE, ""));
}

export function stripNewLinePrefixes(lines: string[]): string[] {
	let hashPrefixed = 0;
	let plusPrefixed = 0;
	let nonEmpty = 0;
	for (const line of lines) {
		if (line.length === 0) continue;
		nonEmpty++;
		if (HASHLINE_PREFIX_RE.test(line)) hashPrefixed++;
		if (DIFF_PLUS_RE.test(line)) plusPrefixed++;
	}
	if (nonEmpty === 0) return lines;
	if (hashPrefixed === nonEmpty) {
		return lines.map((line) => line.replace(HASHLINE_PREFIX_RE, ""));
	}
	if (plusPrefixed === nonEmpty) {
		return lines.map((line) => line.replace(DIFF_PLUS_RE, ""));
	}
	return lines;
}
