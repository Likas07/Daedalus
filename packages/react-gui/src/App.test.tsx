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

test("passes connection and active thread metadata into the shell", async () => {
	const React = await import("react");
	const { createRoot } = await import("react-dom/client");
	const { App } = await import("./App");
	const host = createTestContainer();
	const root = createRoot(host as unknown as Element);

	root.render(
		React.default.createElement(App, {
			server: {
				server: { name: "Daedalus app server", version: "1.0.0" },
				capabilities: { "thread.get": true, "v1.diff.summary": true },
			},
			threadId: "thread-42",
		}),
	);

	await new Promise((resolve) => setTimeout(resolve, 0));

	expect(host.textContent).toContain("Ready: Daedalus app server 1.0.0 · 2 capabilities");
	expect(host.textContent).toContain("Thread thread-42");
	expect(host.textContent).toContain("Protocol v1");
	root.unmount();
	host.remove();
});
