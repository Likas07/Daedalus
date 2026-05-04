import { basename } from "node:path";
import type {
	ProjectSummary,
	ShellEvent,
	ShellSnapshot,
	ShellThreadSummary,
	ThreadActivity,
	ThreadDetailEvent,
	ThreadDetailSnapshot,
	ThreadMessage,
} from "@daedalus-pi/app-server-protocol";
import type {
	ModelSelection,
	OrchestrationMessage,
	OrchestrationProjectShell,
	OrchestrationShellStreamEvent,
	OrchestrationShellStreamItem,
	OrchestrationThread,
	OrchestrationThreadActivity,
	OrchestrationThreadShell,
	RuntimeMode,
} from "@t3tools/contracts";

const EPOCH = new Date(0).toISOString();
const DEFAULT_MODEL: ModelSelection = { provider: "codex", model: "auto" };
const t3Id = <T>(value: string | undefined | null): T => (value ?? "unknown") as T;

type ProjectLike = ProjectSummary & {
	projectId?: string;
	root?: string;
	repositoryIdentity?: OrchestrationProjectShell["repositoryIdentity"];
};

type ThreadLike = ShellThreadSummary & {
	createdAt?: string;
	archivedAt?: string | null;
	branch?: string | null;
	worktreePath?: string | null;
	accessMode?: string;
	model?: string | ModelSelection | null;
	lastTurnId?: string | null;
};

type DetailLike = ThreadDetailSnapshot & {
	summary?: ThreadLike;
	proposedPlans?: OrchestrationThread["proposedPlans"];
	checkpoints?: OrchestrationThread["checkpoints"];
};

function projectId(project: ProjectLike): string {
	return project.projectId ?? project.id;
}

function projectRoot(project: ProjectLike): string {
	return project.root ?? project.path;
}

function isModelSelection(value: unknown): value is ModelSelection {
	return typeof value === "object" && value !== null && "provider" in value && "model" in value;
}

export function mapDaedalusModelSelection(model: ThreadLike["model"]): ModelSelection {
	if (isModelSelection(model)) return model;
	if (typeof model === "string" && model.trim()) return { provider: "codex", model };
	return DEFAULT_MODEL;
}

export function mapAccessToRuntimeMode(accessMode: string): RuntimeMode {
	switch (accessMode) {
		case "read-only":
		case "supervised":
			return "approval-required";
		case "workspace-write":
		case "trusted":
			return "auto-accept-edits";
		case "danger-full-access":
		case "full-access":
			return "full-access";
		default:
			return "approval-required";
	}
}

export function mapProjectToT3Project(project: ProjectLike): OrchestrationProjectShell {
	const root = projectRoot(project);
	return {
		id: t3Id<OrchestrationProjectShell["id"]>(projectId(project)),
		title: project.name || basename(root),
		workspaceRoot: root,
		repositoryIdentity: project.repositoryIdentity ?? null,
		defaultModelSelection: null,
		scripts: [],
		createdAt: project.createdAt ?? project.updatedAt ?? EPOCH,
		updatedAt: project.updatedAt ?? EPOCH,
	};
}

export function mapThreadSummaryToT3Thread(thread: ThreadLike): OrchestrationThreadShell {
	const updatedAt = thread.updatedAt ?? EPOCH;
	const createdAt = thread.createdAt ?? updatedAt;
	const lastTurnId = t3Id<NonNullable<OrchestrationThreadShell["latestTurn"]>["turnId"]>(thread.lastTurnId ?? null);
	const hasLastTurn = Boolean(thread.lastTurnId);
	const activeTurnId = thread.status === "running" && hasLastTurn ? lastTurnId : null;
	return {
		id: t3Id<OrchestrationThreadShell["id"]>(thread.threadId),
		projectId: t3Id<OrchestrationThreadShell["projectId"]>(thread.projectId ?? thread.sessionId),
		title: thread.title || `Thread ${thread.threadId}`,
		modelSelection: mapDaedalusModelSelection(thread.model),
		runtimeMode: mapAccessToRuntimeMode(thread.accessMode ?? "supervised"),
		interactionMode: "default",
		branch: thread.branch ?? null,
		worktreePath: thread.worktreePath ?? null,
		latestTurn: hasLastTurn
			? {
					turnId: lastTurnId,
					state: thread.status === "running" ? "running" : thread.status === "failed" ? "error" : "completed",
					requestedAt: updatedAt,
					startedAt: null,
					completedAt: thread.status === "running" ? null : updatedAt,
					assistantMessageId: null,
				}
			: null,
		createdAt,
		updatedAt,
		archivedAt: thread.archivedAt ?? null,
		session: {
			threadId: t3Id<NonNullable<OrchestrationThreadShell["session"]>["threadId"]>(thread.threadId),
			status: thread.status === "running" ? "running" : thread.status === "failed" ? "error" : "ready",
			providerName: null,
			runtimeMode: mapAccessToRuntimeMode(thread.accessMode ?? "supervised"),
			activeTurnId,
			lastError: thread.status === "failed" ? "Thread failed" : null,
			updatedAt,
		},
		latestUserMessageAt: null,
		hasPendingApprovals: thread.pendingActionCount > 0,
		hasPendingUserInput: false,
		hasActionableProposedPlan: false,
	};
}

function mapThreadMessageToT3Message(message: ThreadMessage): OrchestrationMessage | null {
	if (message.role === "tool") return null;
	return {
		id: t3Id<OrchestrationMessage["id"]>(message.id),
		role: message.role,
		text: message.content,
		turnId: message.turnId ? t3Id<NonNullable<OrchestrationMessage["turnId"]>>(message.turnId) : null,
		streaming: false,
		createdAt: message.createdAt,
		updatedAt: message.createdAt,
	};
}

function mapActivityToT3Activity(activity: ThreadActivity, index: number): OrchestrationThreadActivity {
	return {
		id: t3Id<OrchestrationThreadActivity["id"]>(activity.id),
		tone:
			activity.status === "failed"
				? "error"
				: activity.kind === "tool" || activity.kind === "terminal"
					? "tool"
					: "info",
		kind: activity.kind,
		summary: activity.title,
		payload: {},
		turnId: null,
		sequence: index,
		createdAt: activity.startedAt,
	};
}

export function mapThreadDetailToT3Thread(detail: DetailLike): OrchestrationThread {
	const summary = detail.summary ?? {
		threadId: detail.threadId,
		sessionId: detail.sessionId,
		projectId: detail.projectId,
		worktreeId: detail.worktreeId,
		title: detail.title,
		status: detail.status,
		updatedAt: detail.cursor.updatedAt,
		pendingActionCount: detail.pendingActions.length,
		safetySignals: detail.safetySignals,
	};
	const shell = mapThreadSummaryToT3Thread(summary);
	return {
		...shell,
		deletedAt: null,
		messages: detail.messages
			.map(mapThreadMessageToT3Message)
			.filter((message): message is OrchestrationMessage => message !== null),
		proposedPlans: detail.proposedPlans ?? [],
		activities: detail.activity.map(mapActivityToT3Activity),
		checkpoints: detail.checkpoints ?? [],
	};
}

export function mapShellSnapshotToT3ShellSnapshot(snapshot: ShellSnapshot, projects: readonly ProjectLike[] = []) {
	return {
		snapshotSequence: snapshot.cursor.seq,
		projects: projects.map(mapProjectToT3Project),
		threads: snapshot.threads.map(mapThreadSummaryToT3Thread),
		updatedAt: snapshot.cursor.updatedAt,
	};
}

export function mapShellSnapshotItem(
	snapshot: ShellSnapshot,
	projects: readonly ProjectLike[] = [],
): OrchestrationShellStreamItem {
	return { kind: "snapshot", snapshot: mapShellSnapshotToT3ShellSnapshot(snapshot, projects) };
}

export function mapShellEventToT3Event(event: ShellEvent): OrchestrationShellStreamEvent | null {
	if (event.type === "thread-upserted" && event.thread)
		return { kind: "thread-upserted", sequence: event.seq, thread: mapThreadSummaryToT3Thread(event.thread) };
	if (event.type === "thread-removed" && event.threadId)
		return { kind: "thread-removed", sequence: event.seq, threadId: t3Id(event.threadId) };
	return null;
}

export function applyThreadEventToT3Thread(
	thread: OrchestrationThread,
	event: ThreadDetailEvent,
): OrchestrationThread | null {
	if (event.type === "message-appended" && event.message) {
		const message = mapThreadMessageToT3Message(event.message);
		return message
			? { ...thread, messages: [...thread.messages, message], updatedAt: event.cursor.updatedAt }
			: thread;
	}
	if (event.type === "activity-updated" && event.activity) {
		return {
			...thread,
			activities: [...thread.activities, mapActivityToT3Activity(event.activity, thread.activities.length)],
			updatedAt: event.cursor.updatedAt,
		};
	}
	if (event.type === "snapshot-invalidated") return null;
	return { ...thread, updatedAt: event.cursor.updatedAt };
}
