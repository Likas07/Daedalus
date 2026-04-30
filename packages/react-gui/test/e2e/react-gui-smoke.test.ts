import { expect, test } from "bun:test";
import { createTestContainer } from "../../src/test/setup";

test("mounts the React GUI shell in a browser-like document", async () => {
	const React = await import("react");
	const { createRoot } = await import("react-dom/client");
	const { App } = await import("../../src/App");
	const rootElement = createTestContainer();
	const root = createRoot(rootElement as unknown as Element);

	root.render(
		React.default.createElement(App, { server: { server: { name: "smoke", version: "0" }, capabilities: {} } }),
	);

	expect(rootElement.textContent).toContain("Daedalus");
	expect(rootElement.textContent).toContain("smoke");
	root.unmount();
	rootElement.remove();
});
