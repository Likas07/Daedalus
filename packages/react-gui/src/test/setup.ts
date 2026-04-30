import { mock } from "bun:test";
import { createTestContainer, reactDomClientTestModule, reactTestModule } from "./react-test-runtime";

export function installReactGuiTestHarness(): void {
	mock.module("react", () => ({
		...reactTestModule,
		default: reactTestModule,
	}));
	mock.module("react-dom/client", () => reactDomClientTestModule);
}

export { createTestContainer };

installReactGuiTestHarness();
