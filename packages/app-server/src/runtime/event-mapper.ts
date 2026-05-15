import type { AppEvent, ServerNotification, SessionId, TurnId } from "@daedalus-pi/app-server-protocol";
import type { CanonicalAgentEvent, RuntimeAgentEvent } from "./canonical-agent-events";

export type { RuntimeAgentEvent } from "./canonical-agent-events";

export interface RuntimeEventEnvelope {
	readonly event: AppEvent;
	readonly notification?: ServerNotification;
}

export interface MapRuntimeEventOptions {
	readonly sessionId: SessionId;
	readonly turnId?: TurnId;
	readonly nextEventId?: () => string;
	readonly now?: () => Date;
}

export function mapRuntimeEvent(event: RuntimeAgentEvent, options: MapRuntimeEventOptions): RuntimeEventEnvelope {
	const appEvent = {
		id: options.nextEventId?.() ?? `${options.sessionId}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
		type: `agent/${event.type}`,
		ts: (options.now?.() ?? new Date()).toISOString(),
		sessionId: options.sessionId,
		payload: { ...event, ...(options.turnId ? { turnId: options.turnId } : {}) } as unknown,
	} satisfies AppEvent;

	return {
		event: appEvent,
		notification: mapNotification(event, options.sessionId, options.turnId),
	};
}

export function mapCanonicalAgentEvent(
	event: CanonicalAgentEvent,
	options: Omit<MapRuntimeEventOptions, "turnId">,
): RuntimeEventEnvelope {
	const appEvent = {
		id: options.nextEventId?.() ?? `${options.sessionId}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
		type: event.type,
		ts: (options.now?.() ?? new Date()).toISOString(),
		sessionId: options.sessionId,
		payload: event.payload,
	} satisfies AppEvent;

	return { event: appEvent };
}

function mapNotification(
	event: RuntimeAgentEvent,
	sessionId: SessionId,
	turnId: TurnId | undefined,
): ServerNotification | undefined {
	switch (event.type) {
		case "agent_start":
			return turnId
				? { kind: "notification", method: "turn/changed", params: { sessionId, turnId, status: "running" } }
				: undefined;
		case "agent_end":
			return turnId
				? { kind: "notification", method: "turn/changed", params: { sessionId, turnId, status: "completed" } }
				: undefined;
		case "queue_update":
			return { kind: "notification", method: "session/changed", params: { sessionId, status: "queued" } };
		default:
			return undefined;
	}
}
