import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
	sanitizeGeneratedImagePathSegment,
	saveGeneratedImageArtifact,
} from "../src/core/generated-image-artifacts.js";
import { SettingsManager } from "../src/core/settings-manager.js";

const TINY_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

describe("generated image artifacts", () => {
	let cwd: string | undefined;

	afterEach(() => {
		if (cwd) rmSync(cwd, { recursive: true, force: true });
		cwd = undefined;
	});

	it("writes generated PNGs to safe project-local session paths", async () => {
		cwd = mkdtempSync(join(tmpdir(), "daedalus-generated-images-"));

		const result = await saveGeneratedImageArtifact({
			cwd,
			sessionId: "session/../../abc:123",
			image: {
				id: "call/../../image:01",
				mimeType: "image/png",
				data: TINY_PNG_BASE64,
			},
		});

		const expectedPath = join(cwd, ".daedalus", "generated_images", "session-abc-123", "call-image-01.png");
		expect(result.path).toBe(expectedPath);
		expect(result.fileUri).toMatch(/^file:\/\//);
		expect(fileURLToPath(result.fileUri)).toBe(expectedPath);
		expect(result.visiblePath).toBe(relative(cwd, expectedPath));
		expect(result.persisted).toBe(true);
		expect(existsSync(expectedPath)).toBe(true);
		expect(readFileSync(expectedPath)).toEqual(Buffer.from(TINY_PNG_BASE64, "base64"));
	});

	it("sanitizes empty and unsafe path segments", () => {
		expect(sanitizeGeneratedImagePathSegment("../../")).toBe("image");
		expect(sanitizeGeneratedImagePathSegment(" session id!* ")).toBe("session-id");
	});

	it("uses deterministic overwrite behavior for duplicate image ids", async () => {
		cwd = mkdtempSync(join(tmpdir(), "daedalus-generated-images-"));

		const first = await saveGeneratedImageArtifact({
			cwd,
			sessionId: "session-1",
			image: { id: "image-1", mimeType: "image/png", data: TINY_PNG_BASE64 },
		});
		const second = await saveGeneratedImageArtifact({
			cwd,
			sessionId: "session-1",
			image: { id: "image-1", mimeType: "image/png", data: TINY_PNG_BASE64 },
		});

		expect(second.path).toBe(first.path);
		expect(readFileSync(second.path)).toEqual(Buffer.from(TINY_PNG_BASE64, "base64"));
	});

	it("defaults hosted image generation on and preserves explicit disable", () => {
		expect(SettingsManager.inMemory({}).getHostedImageGeneration()).toEqual({ outputFormat: "png" });
		expect(SettingsManager.inMemory({ images: { hostedGeneration: false } }).getHostedImageGeneration()).toBe(false);
		expect(SettingsManager.inMemory({ images: { hostedGeneration: true } }).getHostedImageGeneration()).toEqual({
			outputFormat: "png",
		});
		expect(
			SettingsManager.inMemory({ images: { hostedGeneration: { outputFormat: "png" } } }).getHostedImageGeneration(),
		).toEqual({ outputFormat: "png" });
	});
});
