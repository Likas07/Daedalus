import type { ReactElement } from "react";

type RenderableElement = {
	readonly type: string | ((props: Record<string, unknown>) => unknown);
	readonly props?: Record<string, unknown> | null;
};

const booleanAttributes = new Set([
	"autofocus",
	"checked",
	"disabled",
	"multiple",
	"open",
	"readonly",
	"required",
	"selected",
]);
const attributeNameMap = new Map([
	["className", "class"],
	["htmlFor", "for"],
]);

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function isRenderableElement(value: unknown): value is RenderableElement {
	return typeof value === "object" && value !== null && "type" in value && "props" in value;
}

function renderAttribute(name: string, value: unknown): string {
	if (
		name === "children" ||
		name === "key" ||
		name === "ref" ||
		value === undefined ||
		value === null ||
		value === false
	) {
		return "";
	}
	if (typeof value === "function" || typeof value === "symbol") return "";

	const attributeName = attributeNameMap.get(name) ?? name;
	if (value === true) {
		return booleanAttributes.has(attributeName.toLowerCase()) ? ` ${attributeName}` : ` ${attributeName}="true"`;
	}
	return ` ${attributeName}="${escapeHtml(String(value))}"`;
}

function renderNode(node: unknown): string {
	if (node === undefined || node === null || typeof node === "boolean") return "";
	if (Array.isArray(node)) return node.map(renderNode).join("");
	if (typeof node === "string" || typeof node === "number" || typeof node === "bigint")
		return escapeHtml(String(node));
	if (!isRenderableElement(node)) return "";
	if (typeof node.type === "function") return renderNode(node.type(node.props ?? {}));
	if (typeof node.type !== "string") return "";

	const props = node.props ?? {};
	const attributes = Object.entries(props)
		.map(([name, value]) => renderAttribute(name, value))
		.join("");
	return `<${node.type}${attributes}>${renderNode(props.children)}</${node.type}>`;
}

export function renderMarkup(element: ReactElement): string {
	return renderNode(element);
}

export function expectMarkupContains(markup: string, expected: readonly string[]): void {
	for (const value of expected) {
		if (!markup.includes(value)) throw new Error(`Expected markup to contain ${value}\n${markup}`);
	}
}
