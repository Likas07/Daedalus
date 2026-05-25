import { randomInt } from "node:crypto";
import type { TelegramRemoteChatBinding } from "./types.js";

export const TELEGRAM_PAIRING_TTL_MS = 60 * 60 * 1000;

export interface TelegramPairingAttempt {
	code: string;
	chatId: number;
	userId: number;
	sessionId: string;
	now: number;
}

type PendingPairingCode = {
	code: string;
	sessionId: string;
	expiresAt: number;
};

export type TelegramPairingResult =
	| { ok: true; binding: TelegramRemoteChatBinding }
	| {
			ok: false;
			reason: "no_code" | "expired" | "invalid_code" | "session_mismatch" | "already_paired";
	  };

export class TelegramRemotePairingStore {
	private pendingCode: PendingPairingCode | undefined;
	private binding: TelegramRemoteChatBinding | undefined;

	createPairingCode(sessionId: string, now: number): string {
		if (this.binding) {
			throw new Error("Telegram remote control is already paired; disconnect before creating a new pairing code");
		}

		const code = generatePairingCode();
		this.pendingCode = {
			code,
			sessionId,
			expiresAt: now + TELEGRAM_PAIRING_TTL_MS,
		};
		return code;
	}

	tryPair(attempt: TelegramPairingAttempt): TelegramPairingResult {
		if (this.binding) {
			return { ok: false, reason: "already_paired" };
		}

		const pending = this.pendingCode;
		if (!pending) {
			return { ok: false, reason: "no_code" };
		}

		if (attempt.now > pending.expiresAt) {
			this.pendingCode = undefined;
			return { ok: false, reason: "expired" };
		}

		if (attempt.sessionId !== pending.sessionId) {
			return { ok: false, reason: "session_mismatch" };
		}

		if (attempt.code.trim() !== pending.code) {
			return { ok: false, reason: "invalid_code" };
		}

		const binding: TelegramRemoteChatBinding = {
			chatId: attempt.chatId,
			userId: attempt.userId,
			pairedAt: attempt.now,
			sessionId: attempt.sessionId,
		};
		this.binding = binding;
		this.pendingCode = undefined;
		return { ok: true, binding };
	}

	getBinding(): TelegramRemoteChatBinding | undefined {
		return this.binding;
	}

	clear(): void {
		this.pendingCode = undefined;
		this.binding = undefined;
	}
}

function generatePairingCode(): string {
	return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
