export const DEFAULT_TOOL_TIMEOUT_MS = 5 * 60_000;

export class ToolTimeoutError extends Error {
	readonly toolName: string;
	readonly timeoutMs: number;

	constructor(toolName: string, timeoutMs: number) {
		super(`Tool ${toolName} timed out after ${timeoutMs}ms`);
		this.name = "ToolTimeoutError";
		this.toolName = toolName;
		this.timeoutMs = timeoutMs;
	}
}

function normalizeAbortReason(signal: AbortSignal): Error {
	const reason = signal.reason;
	if (reason instanceof Error) return reason;
	if (reason !== undefined) return new Error(String(reason));
	return new Error("Tool execution was aborted");
}

/**
 * Execute a tool body with an optional universal timeout.
 *
 * The returned signal is aborted when either the parent signal aborts or the
 * timeout elapses. Timeout aborts are distinguishable via ToolTimeoutError;
 * parent aborts preserve the parent's reason and are not reported as timeouts.
 */
export async function withToolTimeout<T>(
	toolName: string,
	timeoutMs: number | undefined,
	signal: AbortSignal | undefined,
	fn: (innerSignal: AbortSignal) => Promise<T>,
): Promise<T> {
	const controller = new AbortController();
	let settled = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let rejectRace: ((reason: unknown) => void) | undefined;

	const cleanup = () => {
		settled = true;
		if (timer !== undefined) clearTimeout(timer);
		signal?.removeEventListener("abort", onParentAbort);
	};

	const abortOnce = (reason: unknown) => {
		if (settled) return;
		controller.abort(reason);
		rejectRace?.(reason);
	};

	const onParentAbort = () =>
		abortOnce(signal ? normalizeAbortReason(signal) : new Error("Tool execution was aborted"));

	if (signal?.aborted) {
		throw normalizeAbortReason(signal);
	}

	signal?.addEventListener("abort", onParentAbort, { once: true });

	const abortPromise = new Promise<never>((_, reject) => {
		rejectRace = reject;
		if (timeoutMs !== undefined && timeoutMs > 0) {
			timer = setTimeout(() => {
				abortOnce(new ToolTimeoutError(toolName, timeoutMs));
			}, timeoutMs);
		}
	});

	try {
		return await Promise.race([fn(controller.signal), abortPromise]);
	} finally {
		cleanup();
	}
}
