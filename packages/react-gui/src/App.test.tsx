import { expect, test } from "bun:test";
import { createTestContainer } from "./test/setup";

test("renders React Daedalus GUI shell", async () => {
	const React = await import("react");
	const { createRoot } = await import("react-dom/client");
	const { App } = await import("./App");
	const host = createTestContainer();
	const root = createRoot(host as unknown as Element);

	root.render(React.default.createElement(App));

	expect(host.textContent).toContain("Daedalus");
	root.unmount();
	host.remove();
});
