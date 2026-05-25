import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import lockfile from "proper-lockfile";

export interface TelegramPollerLock {
	path: string;
	release(): Promise<void>;
}

export class TelegramPollerLockError extends Error {
	override readonly name = "TelegramPollerLockError";
}

export async function acquireTelegramPollerLock(lockPath: string): Promise<TelegramPollerLock> {
	await mkdir(dirname(lockPath), { recursive: true });
	await writeFile(lockPath, "", { flag: "a" });

	let releaseLock: (() => Promise<void>) | undefined;
	try {
		releaseLock = await lockfile.lock(lockPath, {
			realpath: false,
			retries: 0,
			stale: 30_000,
		});
	} catch (error) {
		throw new TelegramPollerLockError(telegramPollerLockErrorMessage(lockPath), { cause: error });
	}

	let released = false;
	return {
		path: lockPath,
		async release() {
			if (released) return;
			released = true;
			await releaseLock();
		},
	};
}

export function telegramPollerLockErrorMessage(lockPath: string): string {
	return [
		`Telegram remote control is already running for this workspace: ${lockPath}`,
		"Disconnect the other Daedalus bridge before starting a new Telegram poller.",
		"If this is a stale lock, remove it only after confirming no Daedalus Telegram bridge is running.",
	].join(" ");
}
