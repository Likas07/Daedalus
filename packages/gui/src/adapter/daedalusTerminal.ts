import type { AppServerClient } from "@daedalus-pi/app-server-client";
import type { TerminalSnapshot } from "@daedalus-pi/app-server-protocol";
import type {
	TerminalClearInput as T3TerminalClearInput,
	TerminalCloseInput as T3TerminalCloseInput,
	TerminalEvent as T3TerminalEvent,
	TerminalOpenInput as T3TerminalOpenInput,
	TerminalResizeInput as T3TerminalResizeInput,
	TerminalRestartInput as T3TerminalRestartInput,
	TerminalSessionSnapshot as T3TerminalSessionSnapshot,
	TerminalWriteInput as T3TerminalWriteInput,
} from "@t3tools/contracts";
import { unsupported } from "./unsupportedCapabilities";

type Unsubscribe = () => void;

type DaedalusTerminalNotification =
	| { terminalId: string; seq?: number; data?: string; event?: unknown; status?: string }
	| undefined;

function nowIso(): string {
	return new Date().toISOString();
}

export function mapDaedalusTerminalSnapshotToT3(snapshot: TerminalSnapshot): T3TerminalSessionSnapshot {
	return {
		threadId: snapshot.sessionId ?? snapshot.projectId ?? snapshot.worktreeId ?? snapshot.terminalId,
		terminalId: snapshot.terminalId,
		cwd: snapshot.cwd,
		worktreePath: null,
		status: snapshot.status === "killed" ? "exited" : snapshot.status,
		pid: typeof snapshot.pid === "number" && snapshot.pid > 0 ? snapshot.pid : null,
		history: snapshot.history,
		exitCode: snapshot.exitCode ?? null,
		exitSignal: null,
		updatedAt: snapshot.updatedAt,
	};
}

function eventBase(snapshotOrInput: TerminalSnapshot | { sessionId?: string; terminalId: string }) {
	return {
		threadId: snapshotOrInput.sessionId ?? snapshotOrInput.terminalId,
		terminalId: snapshotOrInput.terminalId,
		createdAt: "updatedAt" in snapshotOrInput ? snapshotOrInput.updatedAt : nowIso(),
	};
}

export function mapDaedalusTerminalNotificationToT3(
	params: DaedalusTerminalNotification,
	sessionIdByTerminalId: ReadonlyMap<string, string> = new Map(),
): T3TerminalEvent | null {
	if (!params?.terminalId) return null;
	const base = {
		threadId: sessionIdByTerminalId.get(params.terminalId) ?? params.terminalId,
		terminalId: params.terminalId,
		createdAt: nowIso(),
	};
	if (typeof params.data === "string") {
		return { ...base, type: "output", data: params.data };
	}
	if (params.event && typeof params.event === "object" && "type" in params.event) {
		const event = params.event as {
			type: string;
			data?: unknown;
			status?: unknown;
			exitCode?: unknown;
			signal?: unknown;
		};
		if (event.type === "output" && typeof event.data === "string") {
			return { ...base, type: "output", data: event.data };
		}
		if (event.type === "exit") {
			return {
				...base,
				type: "exited",
				exitCode: typeof event.exitCode === "number" ? event.exitCode : null,
				exitSignal: null,
			};
		}
	}
	if (typeof params.status === "string") {
		return { ...base, type: "exited", exitCode: null, exitSignal: null };
	}
	return null;
}

export const daedalusTerminalApi = {
	async open(client: AppServerClient, input: T3TerminalOpenInput): Promise<T3TerminalSessionSnapshot> {
		const result = await client.request("terminal/create", {
			sessionId: input.threadId,
			cwd: input.cwd,
			...(input.cols ? { cols: input.cols } : {}),
			...(input.rows ? { rows: input.rows } : {}),
		});
		return mapDaedalusTerminalSnapshotToT3(result.terminal);
	},
	async write(client: AppServerClient, input: T3TerminalWriteInput): Promise<void> {
		await client.request("terminal/input", { terminalId: input.terminalId ?? "default", data: input.data });
	},
	async resize(client: AppServerClient, input: T3TerminalResizeInput): Promise<void> {
		await client.request("terminal/resize", {
			terminalId: input.terminalId ?? "default",
			cols: input.cols,
			rows: input.rows,
		});
	},
	async close(client: AppServerClient, input: T3TerminalCloseInput): Promise<void> {
		await client.request("terminal/kill", { terminalId: input.terminalId ?? "default" });
	},
	async clear(_client: AppServerClient, _input: T3TerminalClearInput): Promise<void> {
		// Daedalus has no terminal clear endpoint yet. The drawer handles Ctrl-L/local buffer clear itself.
	},
	async restart(_client: AppServerClient, _input?: T3TerminalRestartInput) {
		return unsupported("terminal-restart");
	},
	subscribe(
		client: AppServerClient,
		input: { terminalId: string; threadId?: string; afterSeq?: number },
		listener: (event: T3TerminalEvent) => void,
	): Unsubscribe {
		let active = true;
		const sessionIds = new Map<string, string>();
		if (input.threadId) sessionIds.set(input.terminalId, input.threadId);
		const emit = (event: T3TerminalEvent | null) => {
			if (active && event) listener(event);
		};
		const unsubs = [
			client.onNotification("terminal/output", (params) =>
				emit(mapDaedalusTerminalNotificationToT3(params, sessionIds)),
			),
			client.onNotification("terminal/event", (params) =>
				emit(mapDaedalusTerminalNotificationToT3(params, sessionIds)),
			),
			client.onNotification("terminal/closed", (params) =>
				emit(mapDaedalusTerminalNotificationToT3(params, sessionIds)),
			),
		];
		void client
			.request("terminal/replay", { terminalId: input.terminalId, afterSeq: input.afterSeq ?? 0 })
			.then((replay) => {
				if (!active) return;
				for (const chunk of replay.chunks) {
					emit({
						...eventBase({ terminalId: input.terminalId, sessionId: input.threadId }),
						type: "output",
						data: chunk.data,
					});
				}
				if (replay.status !== "running" && replay.status !== "starting") {
					emit({
						...eventBase({ terminalId: input.terminalId, sessionId: input.threadId }),
						type: "exited",
						exitCode: null,
						exitSignal: null,
					});
				}
			});
		return () => {
			active = false;
			for (const unsub of unsubs) unsub();
		};
	},
};
