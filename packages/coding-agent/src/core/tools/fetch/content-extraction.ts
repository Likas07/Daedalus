import { parseHTML } from "linkedom";
import type { FetchExtractionOptions, FetchExtractionResult } from "./types.js";

function collapseWhitespace(text: string): string {
	return text.replace(/\r/g, "").replace(/\t/g, " ").replace(/\u00a0/g, " ").replace(/[ \f\v]+/g, " ");
}

function decodeAndNormalizeText(text: string): string {
	return collapseWhitespace(text)
		.split("\n")
		.map((line) => line.trim())
		.filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1].length > 0))
		.join("\n")
		.trim();
}

function extractHtmlAsText(html: string): string {
	const { document } = parseHTML(html);
	for (const selector of ["script", "style", "noscript", "svg", "canvas", "template"]) {
		for (const node of document.querySelectorAll(selector)) node.remove();
	}
	const root = document.querySelector("main") ?? document.body ?? document.documentElement;
	if (!root) return decodeAndNormalizeText(html.replace(/<[^>]+>/g, " "));
	const chunks: string[] = [];
	const walk = (node: any): void => {
		if (node.nodeType === 3) {
			const value = collapseWhitespace(node.textContent || "").trim();
			if (value) chunks.push(value);
			return;
		}
		if (node.nodeType !== 1) return;
		const tag = String(node.tagName || "").toLowerCase();
		if (["br"].includes(tag)) chunks.push("\n");
		if (["p", "div", "section", "article", "li", "tr", "pre", "blockquote"].includes(tag)) chunks.push("\n");
		if (/^h[1-6]$/.test(tag)) chunks.push("\n## ");
		if (tag === "a") {
			const text = collapseWhitespace(node.textContent || "").trim();
			const href = node.getAttribute?.("href")?.trim();
			if (text) chunks.push(href ? `[${text}](${href})` : text);
			return;
		}
		for (const child of Array.from(node.childNodes || [])) walk(child);
		if (["p", "div", "section", "article", "li", "tr", "pre", "blockquote"].includes(tag)) chunks.push("\n");
	};
	walk(root);
	const title = collapseWhitespace(document.querySelector("title")?.textContent || "").trim();
	const body = decodeAndNormalizeText(chunks.join(" "));
	return title && !body.startsWith(title) ? `${title}\n\n${body}`.trim() : body;
}

export function extractFetchedText(body: string, contentType: string, options: FetchExtractionOptions): FetchExtractionResult {
	const normalizedType = contentType.split(";")[0].trim().toLowerCase();
	const extracted = !options.raw && (normalizedType === "text/html" || normalizedType === "application/xhtml+xml")
		? extractHtmlAsText(body)
		: body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
	const originalLength = extracted.length;
	const truncated = extracted.length > options.maxChars;
	const text = truncated ? `${extracted.slice(0, options.maxChars)}\n\n[Truncated: output exceeded ${options.maxChars} chars]` : extracted;
	return { text, contentType: normalizedType || contentType, truncated, originalLength };
}
