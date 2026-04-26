import { describe, expect, test } from "bun:test";
import { createResourcesViewModel } from "./resources-view-model";

describe("createResourcesViewModel", () => {
	test("groups resources and counts diagnostics", () => {
		const vm = createResourcesViewModel({
			resources: [
				{ id: "a", kind: "extension", enabled: true, sourcePath: "/x/a" },
				{ id: "b", kind: "extension", enabled: false, diagnostics: ["bad"], disabledReason: "off" },
				{ id: "c", kind: "theme", source: "global" },
			],
			diagnostics: ["root"],
		});
		expect(vm.total).toBe(3);
		expect(vm.groups.find((g) => g.kind === "extension")?.diagnostics).toBe(1);
		expect(vm.diagnostics).toEqual(["root"]);
	});
});
