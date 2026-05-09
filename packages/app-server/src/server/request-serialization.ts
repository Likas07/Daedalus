import type { ClientRequest } from "@daedalus-pi/app-server-protocol";

export type RequestSerializationScope =
	| { readonly kind: "shared" }
	| { readonly kind: "exclusive"; readonly key: string };

export class RequestSerializer {
	private readonly queues = new Map<string, Promise<void>>();

	async run<T>(request: Pick<ClientRequest, "method" | "params">, operation: () => Promise<T>): Promise<T> {
		const scope = serializationScopeForRequest(request);
		if (scope.kind === "shared") return operation();

		const previous = this.queues.get(scope.key) ?? Promise.resolve();
		let release!: () => void;
		const current = new Promise<void>((resolve) => {
			release = resolve;
		});
		this.queues.set(scope.key, previous.then(() => current, () => current));

		await previous.catch(() => undefined);
		try {
			return await operation();
		} finally {
			release();
			if (this.queues.get(scope.key) === current) this.queues.delete(scope.key);
		}
	}
}

export function serializationScopeForRequest(
	request: Pick<ClientRequest, "method" | "params">,
): RequestSerializationScope {
	const method = request.method;
	if (GLOBAL_EXCLUSIVE_METHODS.has(method)) return { kind: "exclusive", key: "global" };
	if (PROJECT_EXCLUSIVE_METHODS.has(method)) return { kind: "exclusive", key: projectScopeKey(request.params) };
	if (THREAD_EXCLUSIVE_METHODS.has(method)) return { kind: "exclusive", key: threadScopeKey(request.params) };
	return { kind: "shared" };
}

const GLOBAL_EXCLUSIVE_METHODS = new Set<string>([
	"settings/set",
	"settings/reset",
	"settings/reload-resources",
	"auth/login",
	"auth/logout",
	"resources/install",
	"resources/remove",
	"resources/update",
	"resources/enable",
	"resources/disable",
]);

const PROJECT_EXCLUSIVE_METHODS = new Set<string>([
	"worktree/create",
	"worktree/cleanup",
	"git/stage",
	"git/unstage",
	"git/discard",
	"git/commit",
	"git/checkpoint-restore",
	"checkpoint/restore",
]);

const THREAD_EXCLUSIVE_METHODS = new Set<string>([
	"turn/start",
	"turn/cancel",
	"turn.start",
	"turn.cancel",
	"thread.rollback",
	"approval/respond",
	"v1.approval.decide",
	"v1.approval.answer",
]);

function projectScopeKey(params: unknown): string {
	const record = asRecord(params);
	const projectId = stringValue(record.projectId);
	const worktreeId = stringValue(record.worktreeId);
	const sessionId = stringValue(record.sessionId);
	const threadId = stringValue(record.threadId);
	return `project:${projectId ?? worktreeId ?? sessionId ?? threadId ?? "global"}`;
}

function threadScopeKey(params: unknown): string {
	const record = asRecord(params);
	const threadId = stringValue(record.threadId);
	const sessionId = stringValue(record.sessionId);
	const approvalId = stringValue(record.approvalId);
	return `thread:${threadId ?? sessionId ?? approvalId ?? "global"}`;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}
