import type { AppServerTransport } from "./client";

export type InProcessHandler = (message: unknown, sendToClient: (message: unknown) => void) => void | Promise<void>;

export class InProcessAppServerTransport implements AppServerTransport {
	private readonly listeners = new Set<(message: unknown) => void>();
	private readonly closeListeners = new Set<(error?: unknown) => void>();
	private closed = false;

	constructor(private readonly handler: InProcessHandler) {}

	async send(message: unknown): Promise<void> {
		if (this.closed) throw new Error("In-process app-server transport is closed");
		await this.handler(message, (reply) => this.deliver(reply));
	}

	onMessage(listener: (message: unknown) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	onClose(listener: (error?: unknown) => void): () => void {
		this.closeListeners.add(listener);
		return () => this.closeListeners.delete(listener);
	}

	close(): void {
		this.closed = true;
		this.listeners.clear();
		for (const listener of this.closeListeners) listener(new Error("In-process app-server transport is closed"));
		this.closeListeners.clear();
	}

	deliver(message: unknown): void {
		if (this.closed) return;
		for (const listener of this.listeners) listener(message);
	}
}

export function createInProcessTransport(handler: InProcessHandler): InProcessAppServerTransport {
	return new InProcessAppServerTransport(handler);
}
