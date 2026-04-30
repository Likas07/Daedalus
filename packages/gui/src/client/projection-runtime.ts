import type { AppServerClient, Subscription } from "@daedalus-pi/app-server-client";
import type {
	SafetySignal,
	ShellEvent,
	ShellSnapshot,
	ShellThreadSummary,
	ThreadDetailEvent,
	ThreadDetailSnapshot,
} from "@daedalus-pi/app-server-protocol";

import { projectThreadMessages, type ThreadMessageRow } from "./thread-message-projection";

export interface ProjectionShellStore {
	cursor?: ShellSnapshot["cursor"];
	threads: ShellThreadSummary[];
	selectedThreadId?: string;
	safetySignals: SafetySignal[];
	loading?: boolean;
	error?: string;
}

export interface ProjectionThreadStore extends ThreadDetailSnapshot {
	rows: readonly ThreadMessageRow[];
	loading?: boolean;
	error?: string;
}

export interface ProjectionRuntimeState {
	shell: ProjectionShellStore;
	thread?: ProjectionThreadStore;
}

export class ProjectionRuntime {
	readonly state: ProjectionRuntimeState = { shell: { threads: [], safetySignals: [] } };
	#shellSubscription?: Subscription;
	#threadSubscription?: Subscription;
	#activeThreadId?: string;

	constructor(
		private readonly client: AppServerClient,
		private readonly notify: () => void,
	) {}

	startShell(projectId?: string): void {
		this.#shellSubscription?.unsubscribe();
		this.state.shell = { ...this.state.shell, loading: true, error: undefined };
		const unsubscribe = this.client.onNotification("shell/event", (event) => {
			applyShellEvent(this.state.shell, event as ShellEvent);
			this.notify();
		});
		let active = true;
		void this.client.request("shell/snapshot", { projectId }).then((result) => {
			if (!active) return;
			const snapshot = (result as { snapshot?: ShellSnapshot }).snapshot;
			if (!snapshot) throw new Error("Shell projection snapshot unavailable");
			this.state.shell = { ...shellFromSnapshot(snapshot), selectedThreadId: this.#activeThreadId ?? snapshot.selectedThreadId, loading: false };
			this.notify();
		}).catch((error) => {
			if (!active) return;
			this.state.shell = { ...this.state.shell, loading: false, error: error instanceof Error ? error.message : String(error) };
			this.notify();
		});
		this.#shellSubscription = { unsubscribe: () => { active = false; unsubscribe(); } };
	}

	selectThread(threadId?: string): void {
		this.state.shell = { ...this.state.shell, selectedThreadId: threadId };
		if (threadId === this.#activeThreadId) {
			this.notify();
			return;
		}
		this.#activeThreadId = threadId;
		this.#threadSubscription?.unsubscribe();
		this.#threadSubscription = undefined;
		this.state.thread = undefined;
		if (!threadId) {
			this.notify();
			return;
		}
		let active = true;
		const unsubscribe = this.client.onNotification("thread/event", (event) => {
			const typed = event as ThreadDetailEvent;
			if (!active || typed.threadId !== this.#activeThreadId || !this.state.thread) return;
			applyThreadEvent(this.state.thread, typed);
			this.notify();
		});
		void this.client.request("thread/snapshot", { threadId }).then((result) => {
			if (!active) return;
			const snapshot = (result as { snapshot?: ThreadDetailSnapshot }).snapshot;
			if (!snapshot) throw new Error("Thread projection snapshot unavailable");
			if (snapshot.threadId !== this.#activeThreadId) return;
			this.state.thread = threadFromSnapshot(snapshot);
			this.notify();
		}).catch((error) => {
			if (!active) return;
			this.state.thread = { threadId, sessionId: threadId, title: "Thread", status: "idle", messages: [], activity: [], pendingActions: [], safetySignals: [], diffIds: [], rows: [], error: error instanceof Error ? error.message : String(error), cursor: { seq: 0, updatedAt: new Date(0).toISOString() } } as ProjectionThreadStore;
			this.notify();
		});
		this.#threadSubscription = { unsubscribe: () => { active = false; unsubscribe(); } };
	}

	close(): void {
		this.#shellSubscription?.unsubscribe();
		this.#threadSubscription?.unsubscribe();
	}
}

function shellFromSnapshot(snapshot: ShellSnapshot): ProjectionShellStore {
	return {
		cursor: snapshot.cursor,
		threads: [...snapshot.threads],
		selectedThreadId: snapshot.selectedThreadId,
		safetySignals: snapshot.threads.flatMap((thread) => thread.safetySignals),
	};
}

function applyShellEvent(shell: ProjectionShellStore, event: ShellEvent): void {
	if (event.type === "thread-upserted" && event.thread) {
		shell.threads = [event.thread, ...shell.threads.filter((thread) => thread.threadId !== event.thread?.threadId)];
	} else if (event.type === "thread-removed" && event.threadId) {
		shell.threads = shell.threads.filter((thread) => thread.threadId !== event.threadId);
	}
	shell.cursor = event.cursor;
	shell.safetySignals = shell.threads.flatMap((thread) => thread.safetySignals);
}

function threadFromSnapshot(snapshot: ThreadDetailSnapshot): ProjectionThreadStore {
	return { ...snapshot, messages: [...snapshot.messages], activity: [...snapshot.activity], pendingActions: [...snapshot.pendingActions], safetySignals: [...snapshot.safetySignals], diffIds: [...snapshot.diffIds], rows: projectThreadMessages(snapshot) };
}

function applyThreadEvent(thread: ProjectionThreadStore, event: ThreadDetailEvent): void {
	thread.cursor = event.cursor;
	if (event.message) thread.messages = [...thread.messages.filter((message) => message.id !== event.message?.id), event.message];
	if (event.activity) thread.activity = [...thread.activity.filter((item) => item.id !== event.activity?.id), event.activity];
	if (event.pendingActions) thread.pendingActions = [...event.pendingActions];
	if (event.safetySignal) thread.safetySignals = [...thread.safetySignals, event.safetySignal];
	thread.rows = projectThreadMessages(thread);
}
