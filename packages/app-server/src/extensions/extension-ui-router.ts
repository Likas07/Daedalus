import type {
	ExtensionUiRequest,
	ExtensionUiRequestId,
	ExtensionUiResponse,
	ServerNotification,
	ServerRequest,
	SessionId,
} from "@daedalus-pi/app-server-protocol";

export type ExtensionUiRouterEmit = (message: ServerRequest | ServerNotification) => void | Promise<void>;

interface PendingRequest {
	readonly request: ExtensionUiRequest;
	readonly resolve: (response: ExtensionUiResponse) => void;
}

export class ExtensionUiRouter {
	private readonly pending = new Map<ExtensionUiRequestId, PendingRequest>();

	constructor(private readonly emit?: ExtensionUiRouterEmit) {}

	register(request: ExtensionUiRequest, resolve: (response: ExtensionUiResponse) => void): void {
		if (this.pending.has(request.requestId))
			throw new Error(`Extension UI request already registered: ${request.requestId}`);
		this.pending.set(request.requestId, { request, resolve });
	}

	async request(request: ExtensionUiRequest): Promise<ExtensionUiResponse> {
		const promise = new Promise<ExtensionUiResponse>((resolve) => this.register(request, resolve));
		await this.emit?.({ kind: "request", id: request.requestId, method: "extension/ui/request", params: request });
		return promise;
	}

	respond(response: ExtensionUiResponse): void {
		const pending = this.pending.get(response.requestId);
		if (!pending) throw new Error(`Unknown or expired extension UI request: ${response.requestId}`);
		this.pending.delete(response.requestId);
		pending.resolve(response);
	}

	close(requestId: ExtensionUiRequestId): void {
		const pending = this.pending.get(requestId);
		if (!pending) throw new Error(`Unknown or expired extension UI request: ${requestId}`);
		this.pending.delete(requestId);
		pending.resolve({ requestId, actionId: "cancel", values: {} });
		void this.emit?.({ kind: "notification", method: "extension/ui/cancelled", params: { requestId } });
	}

	cancelSession(sessionId: SessionId, reason = "Session stopped"): void {
		for (const [requestId, pending] of [...this.pending]) {
			if (pending.request.sessionId === sessionId) this.cancel(requestId, reason);
		}
	}

	cancelAll(reason = "Extension UI router disposed"): void {
		for (const requestId of [...this.pending.keys()]) this.cancel(requestId, reason);
	}

	has(requestId: ExtensionUiRequestId): boolean {
		return this.pending.has(requestId);
	}

	get size(): number {
		return this.pending.size;
	}

	private cancel(requestId: ExtensionUiRequestId, _reason: string): void {
		const pending = this.pending.get(requestId);
		if (!pending) return;
		this.pending.delete(requestId);
		pending.resolve({ requestId, actionId: "cancel", values: {} });
		void this.emit?.({ kind: "notification", method: "extension/ui/cancelled", params: { requestId } });
	}
}
