import type { SpawnSyncReturns } from "child_process";
import * as childProcess from "child_process";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asMock } from "./helpers/bun-compat.js";

vi.spyOn(childProcess, "spawnSync");
const spawnSyncMock = asMock(
	childProcess.spawnSync as unknown as (command: string, args: readonly string[]) => SpawnSyncReturns<Buffer>,
);
const clipboardMocks = {
	hasImage: vi.fn<() => boolean>(),
	getImageBinary: vi.fn<() => Promise<Uint8Array | null>>(),
};

vi.mock("../src/utils/clipboard-native.js", () => ({
	clipboard: clipboardMocks,
}));

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

function spawnError(error: Error): SpawnSyncReturns<Buffer> {
	return {
		pid: 123,
		output: [Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(0)],
		stdout: Buffer.alloc(0),
		stderr: Buffer.alloc(0),
		status: null,
		signal: null,
		error,
	};
}

describe("readClipboardImage", () => {
	beforeEach(() => {
		spawnSyncMock.mockReset();
		clipboardMocks.hasImage.mockReset();
		clipboardMocks.getImageBinary.mockReset();
	});

	afterAll(() => {
		vi.restoreAllMocks();
	});

	test("Wayland: uses wl-paste and never calls clipboard", async () => {
		clipboardMocks.hasImage.mockImplementation(() => {
			throw new Error("clipboard.hasImage should not be called on Wayland");
		});

		spawnSyncMock.mockImplementation((command: string, args: readonly string[]) => {
			if (command === "wl-paste" && args[0] === "--list-types") {
				return spawnOk(Buffer.from("text/plain\nimage/png\n", "utf-8"));
			}
			if (command === "wl-paste" && args[0] === "--type") {
				return spawnOk(Buffer.from([1, 2, 3]));
			}
			throw new Error(`Unexpected spawnSync call: ${command} ${args.join(" ")}`);
		});

		const { readClipboardImage } = await import("../src/utils/clipboard-image.js");
		const result = await readClipboardImage({ platform: "linux", env: { WAYLAND_DISPLAY: "1" } });
		expect(result).not.toBeNull();
		expect(result?.mimeType).toBe("image/png");
		expect(Array.from(result?.bytes ?? [])).toEqual([1, 2, 3]);
	});

	test("Wayland: falls back to xclip when wl-paste is missing", async () => {
		clipboardMocks.hasImage.mockImplementation(() => {
			throw new Error("clipboard.hasImage should not be called on Wayland");
		});

		const enoent = new Error("spawn ENOENT");
		(enoent as { code?: string }).code = "ENOENT";

		spawnSyncMock.mockImplementation((command: string, args: readonly string[]) => {
			if (command === "wl-paste") {
				return spawnError(enoent);
			}

			if (command === "xclip" && args.includes("TARGETS")) {
				return spawnOk(Buffer.from("image/png\n", "utf-8"));
			}

			if (command === "xclip" && args.includes("image/png")) {
				return spawnOk(Buffer.from([9, 8]));
			}

			return spawnOk(Buffer.alloc(0));
		});

		const { readClipboardImage } = await import("../src/utils/clipboard-image.js");
		const result = await readClipboardImage({ platform: "linux", env: { XDG_SESSION_TYPE: "wayland" } });
		expect(result).not.toBeNull();
		expect(result?.mimeType).toBe("image/png");
		expect(Array.from(result?.bytes ?? [])).toEqual([9, 8]);
	});

	test("Non-Wayland: uses clipboard", async () => {
		spawnSyncMock.mockImplementation(() => {
			throw new Error("spawnSync should not be called for non-Wayland sessions");
		});

		clipboardMocks.hasImage.mockReturnValue(true);
		clipboardMocks.getImageBinary.mockResolvedValue(new Uint8Array([7]));

		const { readClipboardImage } = await import("../src/utils/clipboard-image.js");
		const result = await readClipboardImage({ platform: "linux", env: {} });
		expect(result).not.toBeNull();
		expect(result?.mimeType).toBe("image/png");
		expect(Array.from(result?.bytes ?? [])).toEqual([7]);
	});

	test("Non-Wayland: returns null when clipboard has no image", async () => {
		spawnSyncMock.mockImplementation(() => {
			throw new Error("spawnSync should not be called for non-Wayland sessions");
		});

		clipboardMocks.hasImage.mockReturnValue(false);

		const { readClipboardImage } = await import("../src/utils/clipboard-image.js");
		const result = await readClipboardImage({ platform: "linux", env: {} });
		expect(result).toBeNull();
	});
});
