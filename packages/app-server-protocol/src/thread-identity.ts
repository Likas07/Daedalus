import type { SessionId, ThreadId } from "./ids";

export function threadIdFromSessionId(sessionId: SessionId): ThreadId {
	return sessionId;
}

export function sessionIdFromThreadId(threadId: ThreadId): SessionId {
	return threadId;
}

export function assertSameThreadSessionIdentity(threadId: ThreadId, sessionId: SessionId): void {
	if (threadId !== sessionId) {
		throw new Error(`Thread/session identity mismatch: threadId=${threadId} sessionId=${sessionId}`);
	}
}
