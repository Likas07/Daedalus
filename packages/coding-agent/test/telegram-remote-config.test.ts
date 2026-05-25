import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTelegramUserIds, readTelegramRemoteConfig } from "../src/extensions/telegram-remote/config.js";

describe("telegram remote config", () => {
	const cwd = "/tmp/daedalus-project";

	it("rejects missing bot tokens when enabling", () => {
		expect(() => readTelegramRemoteConfig({}, cwd, { enabled: true })).toThrow(
			"DAEDALUS_TELEGRAM_BOT_TOKEN is required",
		);
	});

	it("defaults to pairing-only DM policy", () => {
		const config = readTelegramRemoteConfig({ DAEDALUS_TELEGRAM_BOT_TOKEN: "123456:telegram-token" }, cwd, {
			enabled: true,
		});

		expect(config).toMatchObject({
			enabled: true,
			botToken: "123456:telegram-token",
			dmPolicy: "pairing",
			allowUserIds: [],
			pairingRequired: true,
			lockPath: join(cwd, ".daedalus", "telegram-remote.lock"),
		});
	});

	it("accepts numeric allowlisted Telegram user IDs", () => {
		const config = readTelegramRemoteConfig(
			{
				DAEDALUS_TELEGRAM_BOT_TOKEN: "123456:telegram-token",
				DAEDALUS_TELEGRAM_ALLOW_USER_IDS: "123, 456,789",
				DAEDALUS_TELEGRAM_DM_POLICY: "allowlist",
			},
			cwd,
			{ enabled: true },
		);

		expect(config.dmPolicy).toBe("allowlist");
		expect(config.allowUserIds).toEqual([123, 456, 789]);
		expect(config.pairingRequired).toBe(false);
	});

	it("rejects non-numeric Telegram allowlist entries", () => {
		expect(() => parseTelegramUserIds("123,@alice")).toThrow(
			"Telegram allowlist entries must be numeric user IDs: @alice",
		);
	});

	it("rejects disabled DM policy for startup", () => {
		expect(() =>
			readTelegramRemoteConfig(
				{
					DAEDALUS_TELEGRAM_BOT_TOKEN: "123456:telegram-token",
					DAEDALUS_TELEGRAM_DM_POLICY: "disabled",
				},
				cwd,
				{ enabled: true },
			),
		).toThrow("Telegram remote control cannot start when DAEDALUS_TELEGRAM_DM_POLICY=disabled");
	});

	it("builds the default lock path inside the current working directory", () => {
		const config = readTelegramRemoteConfig({ DAEDALUS_TELEGRAM_BOT_TOKEN: "123456:telegram-token" }, cwd, {
			enabled: true,
		});

		expect(config.lockPath).toBe(join(cwd, ".daedalus", "telegram-remote.lock"));
	});
});
