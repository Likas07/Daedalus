import { describe, expect, test } from "bun:test";
import { AppServerClient, type AppServerTransport } from "@daedalus-pi/app-server-client";
import type { ShellEvent, ThreadDetailEvent } from "@daedalus-pi/app-server-protocol";
import { ProjectionRuntime } from "./projection-runtime";

class MockTransport implements AppServerTransport {
	listener?: (message: unknown) => void;
	send(message: unknown): void {
		const request = message as { kind?: string; id?: string; method?: string; params?: { threadId?: string } };
		if (request.kind !== "request") return;
		if (request.method === "shell/snapshot") this.respond(request.id, { snapshot: { cursor: cursor(1), selectedThreadId: "thread-1", threads: [thread("thread-1")] } });
		if (request.method === "thread/snapshot") this.respond(request.id, { snapshot: detail(request.params?.threadId ?? "thread-1", 1) });
	}
	onMessage(listener: (message: unknown) => void): () => void { this.listener = listener; return () => { this.listener = undefined; }; }
	close(): void {}
	emit(method: string, params: unknown): void { this.listener?.({ kind: "notification", method, params }); }
	private respond(id: string | undefined, result: unknown): void { this.listener?.({ kind: "response", id, ok: true, result }); }
}

const cursor = (seq: number) => ({ seq, updatedAt: `2026-04-30T00:00:0${seq}.000Z` });
const thread = (threadId: string) => ({ threadId, sessionId: threadId, title: threadId, status: "running" as const, updatedAt: cursor(1).updatedAt, pendingActionCount: 0, safetySignals: [] });
const detail = (threadId: string, seq: number) => ({ cursor: cursor(seq), threadId, sessionId: threadId, title: threadId, status: "running" as const, messages: [], activity: [], pendingActions: [], safetySignals: [], diffIds: [] });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("ProjectionRuntime", () => {
	test("hydrates snapshots and suppresses duplicate and wrong-thread events", async () => {
		const transport = new MockTransport();
		const runtime = new ProjectionRuntime(new AppServerClient({ transport }), () => {});
		runtime.startShell();
		runtime.selectThread("thread-1");
		await tick();
		expect(runtime.state.shell.threads[0]?.threadId).toBe("thread-1");
		expect(runtime.state.thread?.threadId).toBe("thread-1");
		transport.emit("thread/event", { seq: 2, cursor: cursor(2), threadId: "other", sessionId: "other", type: "message-appended", message: { id: "bad", role: "assistant", content: "bad", createdAt: cursor(2).updatedAt } } satisfies ThreadDetailEvent);
		transport.emit("thread/event", { seq: 2, cursor: cursor(2), threadId: "thread-1", sessionId: "thread-1", type: "message-appended", message: { id: "a1", role: "assistant", content: "hi", createdAt: cursor(2).updatedAt } } satisfies ThreadDetailEvent);
		transport.emit("thread/event", { seq: 2, cursor: cursor(2), threadId: "thread-1", sessionId: "thread-1", type: "message-appended", message: { id: "dup", role: "assistant", content: "dup", createdAt: cursor(2).updatedAt } } satisfies ThreadDetailEvent);
		expect(runtime.state.thread?.messages.map((message) => message.content)).toEqual(["hi"]);
	});

	test("cleans detail store on thread switch and preserves runsIn safety signals in shell", async () => {
		const transport = new MockTransport();
		const runtime = new ProjectionRuntime(new AppServerClient({ transport }), () => {});
		runtime.startShell();
		await tick();
		transport.emit("shell/event", { seq: 2, cursor: cursor(2), type: "thread-upserted", thread: { ...thread("thread-2"), worktreeId: "wt-1", safetySignals: [{ level: "warning", message: "isolated worktree", code: "runsIn" }] } } satisfies ShellEvent);
		expect(runtime.state.shell.threads[0]?.worktreeId).toBe("wt-1");
		expect(runtime.state.shell.safetySignals[0]?.code).toBe("runsIn");
		runtime.selectThread("thread-1");
		await tick();
		runtime.selectThread("thread-2");
		expect(runtime.state.thread).toBeUndefined();
		await tick();
		expect(runtime.state.thread?.threadId).toBe("thread-2");
	});
});
