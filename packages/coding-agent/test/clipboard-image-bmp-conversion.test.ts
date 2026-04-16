/**
 * Test for BMP to PNG conversion in clipboard image handling.
 * Separate from clipboard-image.test.ts due to different mocking requirements.
 *
 * This tests the fix for WSL2/WSLg where clipboard often provides image/bmp
 * instead of image/png.
 */
import type { SpawnSyncReturns } from "child_process";
import * as childProcess from "child_process";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asMock } from "./helpers/bun-compat.js";

vi.spyOn(childProcess, "spawnSync");
const spawnSyncMock = asMock(childProcess.spawnSync as unknown as (...args: unknown[]) => SpawnSyncReturns<Buffer>);
const clipboardMocks = {
	hasImage: vi.fn(() => false),
	getImageBinary: vi.fn(() => Promise.resolve(null)),
};

vi.mock("../src/utils/clipboard-native.js", () => ({
	clipboard: clipboardMocks,
}));

function createTinyBmp1x1Red24bpp(): Uint8Array {
	const buffer = Buffer.alloc(58);
	buffer.write("BM", 0, "ascii");
	buffer.writeUInt32LE(buffer.length, 2);
	buffer.writeUInt16LE(0, 6);
	buffer.writeUInt16LE(0, 8);
	buffer.writeUInt32LE(54, 10);
	buffer.writeUInt32LE(40, 14);
	buffer.writeInt32LE(1, 18);
	buffer.writeInt32LE(1, 22);
	buffer.writeUInt16LE(1, 26);
	buffer.writeUInt16LE(24, 28);
	buffer.writeUInt32LE(0, 30);
	buffer.writeUInt32LE(4, 34);
	buffer.writeInt32LE(0, 38);
	buffer.writeInt32LE(0, 42);
	buffer.writeUInt32LE(0, 46);
	buffer.writeUInt32LE(0, 50);
	buffer[54] = 0x00;
	buffer[55] = 0x00;
	buffer[56] = 0xff;
	buffer[57] = 0x00;
	return new Uint8Array(buffer);
}

function spawnOk(stdout: Buffer): SpawnSyncReturns<Buffer> {
	return {
		pid: 123,
		output: [Buffer.alloc(0), stdout, Buffer.alloc(0)],
		stdout,
		stderr: Buffer.alloc(0),
		status: 0,
		signal: null,
	};
}

describe("readClipboardImage BMP conversion", () => {
	beforeEach(() => {
		spawnSyncMock.mockReset();
		clipboardMocks.hasImage.mockReset();
		clipboardMocks.getImageBinary.mockReset();
		clipboardMocks.hasImage.mockReturnValue(false);
		clipboardMocks.getImageBinary.mockResolvedValue(null);
		spawnSyncMock.mockImplementation((command, args) => {
			if (command === "wl-paste" && args.includes("--list-types")) {
				return spawnOk(Buffer.from("image/bmp\n"));
			}
			if (command === "wl-paste" && args.includes("image/bmp")) {
				return spawnOk(Buffer.from(createTinyBmp1x1Red24bpp()));
			}
			return {
				pid: 123,
				output: [Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(0)],
				stdout: Buffer.alloc(0),
				stderr: Buffer.alloc(0),
				status: 1,
				signal: null,
			};
		});
	});

	afterAll(() => {
		vi.restoreAllMocks();
	});

	test("converts BMP to PNG on Wayland/WSLg", async () => {
		const { readClipboardImage } = await import("../src/utils/clipboard-image.js");
		const image = await readClipboardImage({
			env: { WAYLAND_DISPLAY: "wayland-0" },
			platform: "linux",
		});

		expect(image).not.toBeNull();
		expect(image!.mimeType).toBe("image/png");
		expect(image!.bytes[0]).toBe(0x89);
		expect(image!.bytes[1]).toBe(0x50);
		expect(image!.bytes[2]).toBe(0x4e);
		expect(image!.bytes[3]).toBe(0x47);
	});
});
