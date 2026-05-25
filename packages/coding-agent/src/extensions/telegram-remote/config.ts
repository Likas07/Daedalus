import { join } from "node:path";
import type { TelegramDmPolicy, TelegramRemoteConfig } from "./types.js";

const DEFAULT_DM_POLICY: TelegramDmPolicy = "pairing";
const DEFAULT_SESSION_LABEL = "Daedalus CLI";

const DM_POLICIES: ReadonlySet<string> = new Set<TelegramDmPolicy>(["pairing", "allowlist", "disabled"]);

export interface TelegramRemoteConfigOverrides {
	enabled?: boolean;
	botToken?: string;
	dmPolicy?: TelegramDmPolicy;
	allowUserIds?: readonly number[];
	lockPath?: string;
	sessionLabel?: string;
}

export interface TelegramRemoteEnv {
	DAEDALUS_TELEGRAM_BOT_TOKEN?: string;
	DAEDALUS_TELEGRAM_ALLOW_USER_IDS?: string;
	DAEDALUS_TELEGRAM_DM_POLICY?: string;
}

export function parseTelegramUserIds(raw: string | undefined): number[] {
	if (!raw?.trim()) return [];
	return raw
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => {
			if (!/^\d+$/.test(part)) throw new Error(`Telegram allowlist entries must be numeric user IDs: ${part}`);
			return Number(part);
		});
}

export function readTelegramRemoteConfig(
	env: TelegramRemoteEnv,
	cwd: string,
	overrides: TelegramRemoteConfigOverrides = {},
): TelegramRemoteConfig {
	const enabled = overrides.enabled ?? true;
	const botToken = (overrides.botToken ?? env.DAEDALUS_TELEGRAM_BOT_TOKEN ?? "").trim();
	const dmPolicy = overrides.dmPolicy ?? parseTelegramDmPolicy(env.DAEDALUS_TELEGRAM_DM_POLICY);
	const allowUserIds = [...(overrides.allowUserIds ?? parseTelegramUserIds(env.DAEDALUS_TELEGRAM_ALLOW_USER_IDS))];

	if (enabled && !botToken) {
		throw new Error("DAEDALUS_TELEGRAM_BOT_TOKEN is required to enable Telegram remote control");
	}

	if (enabled && dmPolicy === "disabled") {
		throw new Error("Telegram remote control cannot start when DAEDALUS_TELEGRAM_DM_POLICY=disabled");
	}

	return {
		enabled,
		botToken,
		dmPolicy,
		allowUserIds,
		pairingRequired: dmPolicy === "pairing",
		lockPath: overrides.lockPath ?? join(cwd, ".daedalus", "telegram-remote.lock"),
		sessionLabel: overrides.sessionLabel ?? DEFAULT_SESSION_LABEL,
	};
}

function parseTelegramDmPolicy(raw: string | undefined): TelegramDmPolicy {
	const value = raw?.trim();
	if (!value) return DEFAULT_DM_POLICY;

	// Daedalus intentionally does not expose OpenClaw-style "open" policy in v1.
	// Remote control is constrained to pairing, numeric allowlists, or explicit disabled startup.
	if (!DM_POLICIES.has(value)) {
		throw new Error(`DAEDALUS_TELEGRAM_DM_POLICY must be one of pairing, allowlist, or disabled: ${value}`);
	}

	return value as TelegramDmPolicy;
}
