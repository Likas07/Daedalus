import { describe, expect, it } from "bun:test";
import { ALLOWED_EXTENSIONS, hasAllowedExtension } from "../../src/extensions/daedalus/tools/allowed-extensions.js";

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
});
