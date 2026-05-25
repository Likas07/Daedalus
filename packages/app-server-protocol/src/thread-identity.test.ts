import { describe, expect, test } from "bun:test";
import { assertSameThreadSessionIdentity, sessionIdFromThreadId, threadIdFromSessionId } from "./thread-identity";

describe("thread identity compatibility", () => {
	test("maps legacy session ids and durable thread ids without changing wire values", () => {
		expect(threadIdFromSessionId("session-1")).toBe("session-1");
		expect(sessionIdFromThreadId("thread-1")).toBe("thread-1");
		expect(() => assertSameThreadSessionIdentity("same", "same")).not.toThrow();
		expect(() => assertSameThreadSessionIdentity("thread", "session")).toThrow("Thread/session identity mismatch");
	});
});
