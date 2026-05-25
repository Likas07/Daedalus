import { describe, expect, it } from "vitest";
import { TELEGRAM_PAIRING_TTL_MS, TelegramRemotePairingStore } from "../src/extensions/telegram-remote/pairing.js";

describe("TelegramRemotePairingStore", () => {
	const now = 1_700_000_000_000;

	it("generates a short one-time pairing code", () => {
		const store = new TelegramRemotePairingStore();
		const code = store.createPairingCode("session-1", now);

		expect(code).toMatch(/^\d{6}$/);
		expect(store.tryPair({ code, chatId: 100, userId: 200, sessionId: "session-1", now: now + 1 })).toEqual({
			ok: true,
			binding: {
				chatId: 100,
				userId: 200,
				pairedAt: now + 1,
				sessionId: "session-1",
			},
		});
	});

	it("accepts only the expected code", () => {
		const store = new TelegramRemotePairingStore();
		const code = store.createPairingCode("session-1", now);

		const wrongCode = code === "000000" ? "000001" : "000000";
		expect(store.tryPair({ code: wrongCode, chatId: 100, userId: 200, sessionId: "session-1", now })).toEqual({
			ok: false,
			reason: "invalid_code",
		});
		expect(store.getBinding()).toBeUndefined();

		expect(store.tryPair({ code, chatId: 100, userId: 200, sessionId: "session-1", now })).toMatchObject({
			ok: true,
		});
	});

	it("expires old pairing codes", () => {
		const store = new TelegramRemotePairingStore();
		const code = store.createPairingCode("session-1", now);

		expect(
			store.tryPair({
				code,
				chatId: 100,
				userId: 200,
				sessionId: "session-1",
				now: now + TELEGRAM_PAIRING_TTL_MS + 1,
			}),
		).toEqual({ ok: false, reason: "expired" });
		expect(store.getBinding()).toBeUndefined();
		expect(store.tryPair({ code, chatId: 100, userId: 200, sessionId: "session-1", now })).toEqual({
			ok: false,
			reason: "no_code",
		});
	});

	it("binds exactly one DM chat/user/session tuple", () => {
		const store = new TelegramRemotePairingStore();
		const code = store.createPairingCode("session-1", now);

		const result = store.tryPair({ code, chatId: 123, userId: 456, sessionId: "session-1", now: now + 5 });

		expect(result).toEqual({
			ok: true,
			binding: {
				chatId: 123,
				userId: 456,
				pairedAt: now + 5,
				sessionId: "session-1",
			},
		});
		expect(store.getBinding()).toEqual({
			chatId: 123,
			userId: 456,
			pairedAt: now + 5,
			sessionId: "session-1",
		});
	});

	it("does not pair a code created for another session", () => {
		const store = new TelegramRemotePairingStore();
		const code = store.createPairingCode("session-1", now);

		expect(store.tryPair({ code, chatId: 100, userId: 200, sessionId: "session-2", now })).toEqual({
			ok: false,
			reason: "session_mismatch",
		});
		expect(store.getBinding()).toBeUndefined();
	});

	it("prevents a second Telegram user from replacing an existing binding before disconnect", () => {
		const store = new TelegramRemotePairingStore();
		const firstCode = store.createPairingCode("session-1", now);
		expect(store.tryPair({ code: firstCode, chatId: 100, userId: 200, sessionId: "session-1", now })).toMatchObject({
			ok: true,
		});

		expect(() => store.createPairingCode("session-1", now + 1)).toThrow("already paired");
		expect(
			store.tryPair({ code: firstCode, chatId: 101, userId: 201, sessionId: "session-1", now: now + 1 }),
		).toEqual({ ok: false, reason: "already_paired" });
		expect(store.getBinding()).toEqual({ chatId: 100, userId: 200, pairedAt: now, sessionId: "session-1" });

		store.clear();
		const secondCode = store.createPairingCode("session-1", now + 2);
		expect(
			store.tryPair({ code: secondCode, chatId: 101, userId: 201, sessionId: "session-1", now: now + 3 }),
		).toMatchObject({ ok: true });
		expect(store.getBinding()).toEqual({ chatId: 101, userId: 201, pairedAt: now + 3, sessionId: "session-1" });
	});
});
