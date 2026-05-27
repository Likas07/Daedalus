import { describe, expect, it } from "bun:test";
import { ALLOWED_EXTENSIONS, hasAllowedExtension } from "../../src/extensions/semantic-search/allowed-extensions.js";

describe("Forge allowed extensions", () => {
	it("loads forgecode allowed_extensions.txt", () => {
		expect(ALLOWED_EXTENSIONS.has("ts")).toBe(true);
		expect(ALLOWED_EXTENSIONS.has("py")).toBe(true);
		expect(ALLOWED_EXTENSIONS.has("rs")).toBe(true);
		expect(ALLOWED_EXTENSIONS.has("md")).toBe(true);
	});

	it("accepts only listed source/text extensions", () => {
		expect(hasAllowedExtension("src/app.ts")).toBe(true);
		expect(hasAllowedExtension("README.MD")).toBe(true);
		expect(hasAllowedExtension("bun.lockb")).toBe(false);
		expect(hasAllowedExtension("app.exe")).toBe(false);
		expect(hasAllowedExtension("image.png")).toBe(false);
	});

	it("does not depend on runtime filesystem access to load the extension list", async () => {
		const source = await Bun.file(
			new URL("../../src/extensions/semantic-search/allowed-extensions.ts", import.meta.url),
		).text();

		expect(source).not.toContain("node:fs");
		expect(source).not.toContain("readFileSync");
	});
});
