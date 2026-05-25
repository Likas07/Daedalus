import type {
	MessageId,
	OrchestrationLatestTurn,
	OrchestrationThreadActivity,
	ProjectId,
	ThreadId,
	TurnId,
} from "@t3tools/contracts";
import type { EnvironmentState } from "./store";
import type {
	ChatMessage,
	ProposedPlan,
	SidebarThreadSummary,
	Thread,
	ThreadSession,
	ThreadShell,
	ThreadTurnState,
	TurnDiffSummary,
} from "./types";

const EMPTY_THREAD_IDS: ThreadId[] = [];

export function writeThreadStateAggregate(
	state: EnvironmentState,
	nextThread: Thread,
	previousThread?: Thread,
): EnvironmentState {
	const nextShell = toThreadShell(nextThread);
	const nextTurnState = toThreadTurnState(nextThread);
	const previousShell = state.threadShellById[nextThread.id];
	const previousTurnState = state.threadTurnStateById[nextThread.id];

	let nextState = ensureThreadRegisteredAggregate(
		state,
		nextThread.id,
		nextThread.projectId,
		previousThread?.projectId,
	);

	if (!threadShellsEqual(previousShell, nextShell)) {
		nextState = {
			...nextState,
			threadShellById: { ...nextState.threadShellById, [nextThread.id]: nextShell },
		};
	}

	if (!threadSessionsEqual(previousThread?.session ?? null, nextThread.session)) {
		nextState = {
			...nextState,
			threadSessionById: { ...nextState.threadSessionById, [nextThread.id]: nextThread.session },
		};
	}

	if (!threadTurnStatesEqual(previousTurnState, nextTurnState)) {
		nextState = {
			...nextState,
			threadTurnStateById: { ...nextState.threadTurnStateById, [nextThread.id]: nextTurnState },
		};
	}

	if (previousThread?.messages !== nextThread.messages) {
		const nextMessageSlice = buildMessageSlice(nextThread);
		nextState = {
			...nextState,
			messageIdsByThreadId: { ...nextState.messageIdsByThreadId, [nextThread.id]: nextMessageSlice.ids },
			messageByThreadId: { ...nextState.messageByThreadId, [nextThread.id]: nextMessageSlice.byId },
		};
	}

	if (previousThread?.activities !== nextThread.activities) {
		const nextActivitySlice = buildActivitySlice(nextThread);
		nextState = {
			...nextState,
			activityIdsByThreadId: { ...nextState.activityIdsByThreadId, [nextThread.id]: nextActivitySlice.ids },
			activityByThreadId: { ...nextState.activityByThreadId, [nextThread.id]: nextActivitySlice.byId },
		};
	}

	if (previousThread?.proposedPlans !== nextThread.proposedPlans) {
		const nextProposedPlanSlice = buildProposedPlanSlice(nextThread);
		nextState = {
			...nextState,
			proposedPlanIdsByThreadId: {
				...nextState.proposedPlanIdsByThreadId,
				[nextThread.id]: nextProposedPlanSlice.ids,
			},
			proposedPlanByThreadId: { ...nextState.proposedPlanByThreadId, [nextThread.id]: nextProposedPlanSlice.byId },
		};
	}

	if (previousThread?.turnDiffSummaries !== nextThread.turnDiffSummaries) {
		const nextTurnDiffSlice = buildTurnDiffSlice(nextThread);
		nextState = {
			...nextState,
			turnDiffIdsByThreadId: { ...nextState.turnDiffIdsByThreadId, [nextThread.id]: nextTurnDiffSlice.ids },
			turnDiffSummaryByThreadId: { ...nextState.turnDiffSummaryByThreadId, [nextThread.id]: nextTurnDiffSlice.byId },
		};
	}

	return nextState;
}

export function writeThreadShellStateAggregate(
	state: EnvironmentState,
	nextThread: {
		shell: ThreadShell;
		session: ThreadSession | null;
		turnState: ThreadTurnState;
		summary: SidebarThreadSummary;
	},
): EnvironmentState {
	const previousShell = state.threadShellById[nextThread.shell.id];
	let nextState = ensureThreadRegisteredAggregate(
		state,
		nextThread.shell.id,
		nextThread.shell.projectId,
		previousShell?.projectId,
	);

	if (!threadShellsEqual(previousShell, nextThread.shell)) {
		nextState = {
			...nextState,
			threadShellById: { ...nextState.threadShellById, [nextThread.shell.id]: nextThread.shell },
		};
	}
	if (!threadSessionsEqual(state.threadSessionById[nextThread.shell.id] ?? null, nextThread.session)) {
		nextState = {
			...nextState,
			threadSessionById: { ...nextState.threadSessionById, [nextThread.shell.id]: nextThread.session },
		};
	}
	if (!threadTurnStatesEqual(state.threadTurnStateById[nextThread.shell.id], nextThread.turnState)) {
		nextState = {
			...nextState,
			threadTurnStateById: { ...nextState.threadTurnStateById, [nextThread.shell.id]: nextThread.turnState },
		};
	}
	if (!sidebarThreadSummariesEqual(state.sidebarThreadSummaryById[nextThread.shell.id], nextThread.summary)) {
		nextState = {
			...nextState,
			sidebarThreadSummaryById: {
				...nextState.sidebarThreadSummaryById,
				[nextThread.shell.id]: nextThread.summary,
			},
		};
	}
	return nextState;
}

export function retainThreadScopedRecordAggregate<T>(
	record: Record<ThreadId, T>,
	nextThreadIds: ReadonlySet<ThreadId>,
): Record<ThreadId, T> {
	return Object.fromEntries(
		Object.entries(record).flatMap(([threadId, value]) =>
			nextThreadIds.has(threadId as ThreadId) ? [[threadId, value] as const] : [],
		),
	) as Record<ThreadId, T>;
}

export function removeThreadStateAggregate(state: EnvironmentState, threadId: ThreadId): EnvironmentState {
	const shell = state.threadShellById[threadId];
	if (!shell) return state;

	const nextThreadIds = removeId(state.threadIds, threadId);
	const currentProjectThreadIds = state.threadIdsByProjectId[shell.projectId] ?? EMPTY_THREAD_IDS;
	const nextProjectThreadIds = removeId(currentProjectThreadIds, threadId);
	const nextThreadIdsByProjectId =
		nextProjectThreadIds.length === 0
			? (() => {
					const { [shell.projectId]: _removed, ...rest } = state.threadIdsByProjectId;
					return rest as Record<ProjectId, ThreadId[]>;
				})()
			: { ...state.threadIdsByProjectId, [shell.projectId]: nextProjectThreadIds };

	const { [threadId]: _removedShell, ...threadShellById } = state.threadShellById;
	const { [threadId]: _removedSession, ...threadSessionById } = state.threadSessionById;
	const { [threadId]: _removedTurnState, ...threadTurnStateById } = state.threadTurnStateById;
	const { [threadId]: _removedMessageIds, ...messageIdsByThreadId } = state.messageIdsByThreadId;
	const { [threadId]: _removedMessages, ...messageByThreadId } = state.messageByThreadId;
	const { [threadId]: _removedActivityIds, ...activityIdsByThreadId } = state.activityIdsByThreadId;
	const { [threadId]: _removedActivities, ...activityByThreadId } = state.activityByThreadId;
	const { [threadId]: _removedPlanIds, ...proposedPlanIdsByThreadId } = state.proposedPlanIdsByThreadId;
	const { [threadId]: _removedPlans, ...proposedPlanByThreadId } = state.proposedPlanByThreadId;
	const { [threadId]: _removedTurnDiffIds, ...turnDiffIdsByThreadId } = state.turnDiffIdsByThreadId;
	const { [threadId]: _removedTurnDiffs, ...turnDiffSummaryByThreadId } = state.turnDiffSummaryByThreadId;
	const { [threadId]: _removedSidebarSummary, ...sidebarThreadSummaryById } = state.sidebarThreadSummaryById;

	return {
		...state,
		threadIds: nextThreadIds,
		threadIdsByProjectId: nextThreadIdsByProjectId,
		threadShellById,
		threadSessionById,
		threadTurnStateById,
		messageIdsByThreadId,
		messageByThreadId,
		activityIdsByThreadId,
		activityByThreadId,
		proposedPlanIdsByThreadId,
		proposedPlanByThreadId,
		turnDiffIdsByThreadId,
		turnDiffSummaryByThreadId,
		sidebarThreadSummaryById,
	};
}

function ensureThreadRegisteredAggregate(
	state: EnvironmentState,
	threadId: ThreadId,
	nextProjectId: ProjectId,
	previousProjectId: ProjectId | undefined,
): EnvironmentState {
	let nextState = state;
	if (!state.threadIds.includes(threadId)) nextState = { ...nextState, threadIds: [...nextState.threadIds, threadId] };
	if (previousProjectId !== nextProjectId) {
		let threadIdsByProjectId = nextState.threadIdsByProjectId;
		if (previousProjectId) {
			const previousIds = threadIdsByProjectId[previousProjectId] ?? EMPTY_THREAD_IDS;
			const nextIds = removeId(previousIds, threadId);
			if (nextIds.length === 0) {
				const { [previousProjectId]: _removed, ...rest } = threadIdsByProjectId;
				threadIdsByProjectId = rest as Record<ProjectId, ThreadId[]>;
			} else if (!arraysEqual(previousIds, nextIds)) {
				threadIdsByProjectId = { ...threadIdsByProjectId, [previousProjectId]: nextIds };
			}
		}
		const projectThreadIds = threadIdsByProjectId[nextProjectId] ?? EMPTY_THREAD_IDS;
		const nextProjectThreadIds = appendId(projectThreadIds, threadId);
		if (!arraysEqual(projectThreadIds, nextProjectThreadIds)) {
			threadIdsByProjectId = { ...threadIdsByProjectId, [nextProjectId]: nextProjectThreadIds };
		}
		if (threadIdsByProjectId !== nextState.threadIdsByProjectId) nextState = { ...nextState, threadIdsByProjectId };
	}
	return nextState;
}

function toThreadShell(thread: Thread): ThreadShell {
	return {
		id: thread.id,
		environmentId: thread.environmentId,
		codexThreadId: thread.codexThreadId,
		projectId: thread.projectId,
		title: thread.title,
		modelSelection: thread.modelSelection,
		runtimeMode: thread.runtimeMode,
		interactionMode: thread.interactionMode,
		error: thread.error,
		createdAt: thread.createdAt,
		archivedAt: thread.archivedAt,
		updatedAt: thread.updatedAt,
		branch: thread.branch,
		worktreePath: thread.worktreePath,
	};
}

function toThreadTurnState(thread: Thread): ThreadTurnState {
	return {
		latestTurn: thread.latestTurn,
		...(thread.pendingSourceProposedPlan ? { pendingSourceProposedPlan: thread.pendingSourceProposedPlan } : {}),
	};
}

function sourceProposedPlansEqual(
	left: OrchestrationLatestTurn["sourceProposedPlan"] | undefined,
	right: OrchestrationLatestTurn["sourceProposedPlan"] | undefined,
): boolean {
	if (left === right) return true;
	if (left === undefined || right === undefined) return false;
	return left.threadId === right.threadId && left.planId === right.planId;
}

function latestTurnsEqual(
	left: OrchestrationLatestTurn | null | undefined,
	right: OrchestrationLatestTurn | null | undefined,
): boolean {
	if (left === right) return true;
	if (left == null || right == null) return false;
	return (
		left.turnId === right.turnId &&
		left.state === right.state &&
		left.requestedAt === right.requestedAt &&
		left.startedAt === right.startedAt &&
		left.completedAt === right.completedAt &&
		left.assistantMessageId === right.assistantMessageId &&
		sourceProposedPlansEqual(left.sourceProposedPlan, right.sourceProposedPlan)
	);
}

function threadSessionsEqual(left: ThreadSession | null | undefined, right: ThreadSession | null | undefined): boolean {
	if (left === right) return true;
	if (left == null || right == null) return false;
	return (
		left.provider === right.provider &&
		left.status === right.status &&
		left.orchestrationStatus === right.orchestrationStatus &&
		left.activeTurnId === right.activeTurnId &&
		left.createdAt === right.createdAt &&
		left.updatedAt === right.updatedAt &&
		left.lastError === right.lastError
	);
}

function sidebarThreadSummariesEqual(left: SidebarThreadSummary | undefined, right: SidebarThreadSummary): boolean {
	return (
		left !== undefined &&
		left.id === right.id &&
		left.projectId === right.projectId &&
		left.title === right.title &&
		left.interactionMode === right.interactionMode &&
		threadSessionsEqual(left.session, right.session) &&
		left.createdAt === right.createdAt &&
		left.archivedAt === right.archivedAt &&
		left.updatedAt === right.updatedAt &&
		latestTurnsEqual(left.latestTurn, right.latestTurn) &&
		left.branch === right.branch &&
		left.worktreePath === right.worktreePath &&
		left.latestUserMessageAt === right.latestUserMessageAt &&
		left.hasPendingApprovals === right.hasPendingApprovals &&
		left.hasPendingUserInput === right.hasPendingUserInput &&
		left.hasActionableProposedPlan === right.hasActionableProposedPlan
	);
}

function threadShellsEqual(left: ThreadShell | undefined, right: ThreadShell): boolean {
	return (
		left !== undefined &&
		left.id === right.id &&
		left.environmentId === right.environmentId &&
		left.codexThreadId === right.codexThreadId &&
		left.projectId === right.projectId &&
		left.title === right.title &&
		left.modelSelection === right.modelSelection &&
		left.runtimeMode === right.runtimeMode &&
		left.interactionMode === right.interactionMode &&
		left.error === right.error &&
		left.createdAt === right.createdAt &&
		left.archivedAt === right.archivedAt &&
		left.updatedAt === right.updatedAt &&
		left.branch === right.branch &&
		left.worktreePath === right.worktreePath
	);
}

function threadTurnStatesEqual(left: ThreadTurnState | undefined, right: ThreadTurnState): boolean {
	return (
		left !== undefined &&
		latestTurnsEqual(left.latestTurn, right.latestTurn) &&
		sourceProposedPlansEqual(left.pendingSourceProposedPlan, right.pendingSourceProposedPlan)
	);
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function appendId<T extends string>(ids: readonly T[], id: T): T[] {
	return ids.includes(id) ? [...ids] : [...ids, id];
}

function removeId<T extends string>(ids: readonly T[], id: T): T[] {
	return ids.filter((value) => value !== id);
}

function buildMessageSlice(thread: Thread): { ids: MessageId[]; byId: Record<MessageId, ChatMessage> } {
	return {
		ids: thread.messages.map((message) => message.id),
		byId: Object.fromEntries(thread.messages.map((message) => [message.id, message] as const)) as Record<
			MessageId,
			ChatMessage
		>,
	};
}

function buildActivitySlice(thread: Thread): { ids: string[]; byId: Record<string, OrchestrationThreadActivity> } {
	return {
		ids: thread.activities.map((activity) => activity.id),
		byId: Object.fromEntries(thread.activities.map((activity) => [activity.id, activity] as const)) as Record<
			string,
			OrchestrationThreadActivity
		>,
	};
}

function buildProposedPlanSlice(thread: Thread): { ids: string[]; byId: Record<string, ProposedPlan> } {
	return {
		ids: thread.proposedPlans.map((plan) => plan.id),
		byId: Object.fromEntries(thread.proposedPlans.map((plan) => [plan.id, plan] as const)) as Record<
			string,
			ProposedPlan
		>,
	};
}

function buildTurnDiffSlice(thread: Thread): { ids: TurnId[]; byId: Record<TurnId, TurnDiffSummary> } {
	return {
		ids: thread.turnDiffSummaries.map((summary) => summary.turnId),
		byId: Object.fromEntries(thread.turnDiffSummaries.map((summary) => [summary.turnId, summary] as const)) as Record<
			TurnId,
			TurnDiffSummary
		>,
	};
}
