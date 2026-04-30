export interface TestElementNode {
	readonly type: string | ((props: Record<string, unknown>) => unknown);
	readonly props: Record<string, unknown>;
	readonly children: readonly unknown[];
}

export interface TestContainer {
	textContent: string;
	remove(): void;
}

export const reactTestModule = {
	createElement(
		type: string | ((props: Record<string, unknown>) => unknown),
		props?: Record<string, unknown> | null,
		...children: unknown[]
	): TestElementNode {
		return { type, props: props ?? {}, children };
	},
};

export const reactDomClientTestModule = {
	createRoot(container: TestContainer) {
		return {
			render(node: unknown): void {
				container.textContent = renderText(node);
			},
			unmount(): void {
				container.textContent = "";
			},
		};
	},
};

export function createTestContainer(): TestContainer {
	return {
		textContent: "",
		remove() {
			this.textContent = "";
		},
	};
}

function isTestElementNode(node: unknown): node is TestElementNode {
	return typeof node === "object" && node !== null && "type" in node && "props" in node && "children" in node;
}

function renderText(node: unknown): string {
	if (node === undefined || node === null || typeof node === "boolean") return "";
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(renderText).join("");
	if (!isTestElementNode(node)) return "";

	if (typeof node.type === "function") {
		return renderText(node.type({ ...node.props, children: node.children }));
	}

	return node.children.map(renderText).join("");
}
