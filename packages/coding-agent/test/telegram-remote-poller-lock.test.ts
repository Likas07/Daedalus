import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireTelegramPollerLock, TelegramPollerLockError } from "../src/extensions/telegram-remote/poller-lock.js";

describe("acquireTelegramPollerLock", () => {
	let tempDir: string | undefined;

	afterEach(() => {
		if (tempDir) {
			rmSync(tempDir, { recursive: true, force: true });
			tempDir = undefined;
		}
	});

	function lockPath() {
		tempDir = mkdtempSync(join(tmpdir(), "daedalus-telegram-lock-"));
		return join(tempDir, ".daedalus", "telegram-remote.lock");
	}

	it("creates the containing directory and acquires a lock", async () => {
		const path = lockPath();

		const lock = await acquireTelegramPollerLock(path);

		expect(lock.path).toBe(path);
		expect(existsSync(path)).toBe(true);
		expect(existsSync(`${path}.lock`)).toBe(true);

		await lock.release();
		expect(existsSync(`${path}.lock`)).toBe(false);
	});

	it("prevents a second poller from starting for the same lock path", async () => {
		const path = lockPath();
		const first = await acquireTelegramPollerLock(path);

		await expect(acquireTelegramPollerLock(path)).rejects.toThrow(TelegramPollerLockError);
		await expect(acquireTelegramPollerLock(path)).rejects.toThrow("Disconnect the other Daedalus bridge");
		await expect(acquireTelegramPollerLock(path)).rejects.toThrow(
			"remove it only after confirming no Daedalus Telegram bridge is running",
		);

		await first.release();
	});

	it("allows a new poller after the previous lock is released", async () => {
		const path = lockPath();
		const first = await acquireTelegramPollerLock(path);
		await first.release();

		const second = await acquireTelegramPollerLock(path);
		expect(second.path).toBe(path);
		await second.release();
	});

	it("release is idempotent", async () => {
		const path = lockPath();
		const lock = await acquireTelegramPollerLock(path);

		await lock.release();
		await lock.release();

		expect(existsSync(`${path}.lock`)).toBe(false);
	});
});
