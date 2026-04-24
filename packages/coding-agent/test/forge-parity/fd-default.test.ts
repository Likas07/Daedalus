import { describe, expect, it } from "bun:test";
import { discoverFdDefault } from "../../src/extensions/daedalus/tools/fd-default.js";

describe("FdDefault routing", () => {
	it("returns git discovery when git yields files", async () => {
		const actual = await discoverFdDefault("/tmp/does-not-matter", {
			discoverGit: async () => ["/repo/a.ts"],
			discoverWalker: async () => ["/repo/walker.ts"],
		});
		expect(actual).toEqual(["/repo/a.ts"]);
	});

	it("falls back to walker on empty, undefined, or failed git discovery", async () => {
		expect(
			await discoverFdDefault("/tmp", { discoverGit: async () => undefined, discoverWalker: async () => ["/w.ts"] }),
		).toEqual(["/w.ts"]);
		expect(
			await discoverFdDefault("/tmp", { discoverGit: async () => [], discoverWalker: async () => ["/w.ts"] }),
		).toEqual(["/w.ts"]);
		expect(
			await discoverFdDefault("/tmp", {
				discoverGit: async () => {
					throw new Error("boom");
				},
				discoverWalker: async () => ["/w.ts"],
			}),
		).toEqual(["/w.ts"]);
	});
});
