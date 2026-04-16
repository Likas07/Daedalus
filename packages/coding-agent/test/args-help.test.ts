import { afterEach, describe, expect, test, vi } from "vitest";
import { printHelp } from "../src/cli/args.js";
import { BUILTIN_TOOL_ORDER, DEFAULT_ACTIVE_TOOL_NAMES } from "../src/core/tools/defaults.js";

describe("printHelp", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("renders default and available tool lists from the centralized built-in tool constants", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		printHelp();

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = logSpy.mock.calls[0]?.[0];
		expect(output).toContain(`default: ${DEFAULT_ACTIVE_TOOL_NAMES.join(",")}`);
		expect(output).toContain(`Available: ${BUILTIN_TOOL_ORDER.join(", ")}`);
	});
});
