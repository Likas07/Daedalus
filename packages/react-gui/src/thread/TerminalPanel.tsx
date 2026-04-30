import {
	closeTerminal,
	onTerminalChanged,
	onTerminalOutput,
	openTerminal,
	replayTerminalOutput,
	sendTerminalInput,
	type TerminalV1NotificationClient,
} from "@daedalus-pi/app-server-client";
import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import { TerminalDrawer } from "@daedalus-pi/gui-components";
import {
	createInitialTerminalDrawerState,
	type TerminalDrawerState,
	terminalDrawerReducer,
} from "@daedalus-pi/gui-core/terminal/reducer";
import React, { type ReactNode } from "react";

interface ReactHookRuntime {
	useEffect(effect: () => undefined | (() => void), dependencies: readonly unknown[]): void;
	useState<T>(initial: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void];
}

const ReactHooks = React as unknown as ReactHookRuntime;

export interface TerminalPanelProps {
	readonly client: TerminalV1NotificationClient;
	readonly threadId: string;
	readonly workspaceTargetId?: string;
	readonly turnId?: string;
}

export function TerminalPanel({ client, threadId, workspaceTargetId, turnId }: TerminalPanelProps): ReactNode {
	const [state, setState] = ReactHooks.useState<TerminalDrawerState>(() => createInitialTerminalDrawerState());
	const dispatch = (action: Parameters<typeof terminalDrawerReducer>[1]) =>
		setState((current) => terminalDrawerReducer(current, action));

	ReactHooks.useEffect(() => {
		const unsubscribeChanged = onTerminalChanged(client, (notification) => {
			if (notification.threadId !== threadId || notification.workspaceTargetId !== workspaceTargetId) return;
			dispatch({
				type: "terminal.contextChanged",
				context: notificationToContext(notification, state.contextsById[notification.terminal.terminalId]),
			});
		});
		const unsubscribeOutput = onTerminalOutput(client, (notification) => {
			if (notification.threadId !== threadId || notification.workspaceTargetId !== workspaceTargetId) return;
			dispatch({
				type: "terminal.outputAppended",
				terminalId: notification.terminalId,
				chunk: { cursor: notification.cursor, text: "", byteLength: notification.byteLength },
			});
		});
		return () => {
			unsubscribeChanged();
			unsubscribeOutput();
		};
	}, [client, threadId, workspaceTargetId]);

	const open = async () => {
		if (!workspaceTargetId) return;
		dispatch({ type: "terminal.drawerOpened" });
		try {
			const result = await openTerminal(client, {
				threadId,
				workspaceTargetId,
				turnId,
				route: "workspace-shell",
				rows: 24,
				cols: 80,
			});
			if (result.ok) dispatch({ type: "terminal.commandCompleted", result });
			else dispatch({ type: "terminal.commandFailed", failure: result });
		} catch (error) {
			dispatch({ type: "terminal.error", error: error instanceof Error ? error.message : String(error) });
		}
	};

	const sendInput = async (terminalId: string, input: string) => {
		if (!workspaceTargetId) return;
		try {
			const result = await sendTerminalInput(client, { terminalId, threadId, workspaceTargetId, turnId, input });
			if (result.ok) dispatch({ type: "terminal.commandCompleted", result });
			else dispatch({ type: "terminal.commandFailed", failure: result });
		} catch (error) {
			dispatch({ type: "terminal.error", error: error instanceof Error ? error.message : String(error) });
		}
	};

	const close = async (terminalId: string) => {
		if (!workspaceTargetId) return;
		try {
			const result = await closeTerminal(client, {
				terminalId,
				threadId,
				workspaceTargetId,
				turnId,
				reason: "user",
			});
			if (result.ok) dispatch({ type: "terminal.commandCompleted", result });
			else dispatch({ type: "terminal.commandFailed", failure: result });
		} catch (error) {
			dispatch({ type: "terminal.error", error: error instanceof Error ? error.message : String(error) });
		}
	};

	const reconnect = async (terminalId: string) => {
		if (!workspaceTargetId) return;
		dispatch({ type: "terminal.replayStarted", terminalId });
		try {
			const result = await replayTerminalOutput(client, {
				terminalId,
				threadId,
				workspaceTargetId,
				turnId,
				limit: 200,
			});
			if (result.ok) dispatch({ type: "terminal.replayLoaded", result });
			else dispatch({ type: "terminal.commandFailed", failure: result });
		} catch (error) {
			dispatch({ type: "terminal.error", error: error instanceof Error ? error.message : String(error) });
		}
	};

	return React.createElement(TerminalDrawer, {
		state,
		onOpen: open,
		onSendInput: sendInput,
		onCloseTerminal: close,
		onReconnectTerminal: reconnect,
	});
}

function notificationToContext(
	notification: protocolV1.TerminalContextNotification,
	previous: protocolV1.TerminalContext | undefined,
): protocolV1.TerminalContext {
	const now = new Date(0).toISOString();
	return {
		terminalId: notification.terminal.terminalId,
		threadId: notification.threadId,
		turnId: notification.turnId,
		workspaceTargetId: notification.workspaceTargetId,
		title: previous?.title ?? "Terminal",
		status: notification.status,
		cwd: previous?.cwd ?? ".",
		rows: previous?.rows ?? 24,
		cols: previous?.cols ?? 80,
		createdAt: previous?.createdAt ?? now,
		updatedAt: now,
		lastOutputCursor: previous?.lastOutputCursor,
	};
}
