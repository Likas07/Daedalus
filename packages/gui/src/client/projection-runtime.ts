import { subscribeShell, subscribeThread, type AppServerClient, type Subscription } from "@daedalus-pi/app-server-client";
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
}

export interface ProjectionThreadStore extends ThreadDetailSnapshot {
	rows: readonly ThreadMessageRow[];
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
		this.#shellSubscription = subscribeShell(this.client, { projectId }, {
			onSnapshot: (snapshot) => {
				this.state.shell = shellFromSnapshot(snapshot);
				this.notify();
			},
			onEvent: (event) => {
				applyShellEvent(this.state.shell, event);
				this.notify();
			},
		});
	}

	selectThread(threadId?: string): void {
		if (threadId === this.#activeThreadId) return;
		this.#activeThreadId = threadId;
		this.#threadSubscription?.unsubscribe();
		this.#threadSubscription = undefined;
		this.state.thread = undefined;
		if (!threadId) {
			this.notify();
			return;
		}
		this.#threadSubscription = subscribeThread(this.client, { threadId }, {
			onSnapshot: (snapshot) => {
				if (snapshot.threadId !== this.#activeThreadId) return;
				this.state.thread = threadFromSnapshot(snapshot);
				this.notify();
			},
			onEvent: (event) => {
				if (event.threadId !== this.#activeThreadId || !this.state.thread) return;
				applyThreadEvent(this.state.thread, event);
				this.notify();
			},
		});
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
