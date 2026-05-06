import type { ExtensionUIContext } from "../extensions/types.js";

export interface SubagentInteractionContext {
	runId: string;
	agent: string;
	goal?: string;
}

type BlockingMethod = "select" | "input" | "confirm" | "editor" | "custom";

type QueueItem<T> = {
	context: SubagentInteractionContext;
	method: BlockingMethod;
	run: () => Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
};

function titlePrefix(context: SubagentInteractionContext): string {
	const goal = context.goal ? ` · ${context.goal}` : "";
	return `Subagent ${context.agent} (${context.runId})${goal}`;
}

function cancelledValue(method: BlockingMethod): unknown {
	return method === "confirm" ? false : undefined;
}

export class SubagentInteractionBroker {
	#parentUI?: ExtensionUIContext;
	#queue: QueueItem<unknown>[] = [];
	#active = false;
	#disposed = false;
	#statusKey: string;

	constructor(parentUI: ExtensionUIContext | undefined, options: { statusKey?: string } = {}) {
		this.#parentUI = parentUI;
		this.#statusKey = options.statusKey ?? "subagent-interactions";
	}

	createUIContext(context: SubagentInteractionContext): ExtensionUIContext | undefined {
		const parent = this.#parentUI;
		if (!parent) return undefined;
		return new Proxy(parent, {
			get: (target, property, receiver) => {
				if (property === "select") {
					return (title: string, options: string[]) =>
						this.#enqueue(context, "select", () => target.select(`${titlePrefix(context)}\n${title}`, options));
				}
				if (property === "input") {
					return (title: string, placeholder?: string) =>
						this.#enqueue(context, "input", () => target.input(`${titlePrefix(context)}\n${title}`, placeholder));
				}
				if (property === "confirm") {
					return (title: string, message = "") =>
						this.#enqueue(context, "confirm", () => target.confirm(`${titlePrefix(context)}\n${title}`, message));
				}
				if (property === "editor") {
					return (title: string, prefill?: string) =>
						this.#enqueue(context, "editor", () => target.editor(`${titlePrefix(context)}\n${title}`, prefill));
				}
				if (property === "custom") {
					return (...args: Parameters<ExtensionUIContext["custom"]>) =>
						this.#enqueue(context, "custom", () => target.custom(...args));
				}
				return Reflect.get(target, property, receiver);
			},
		}) as ExtensionUIContext;
	}

	async #enqueue<T>(context: SubagentInteractionContext, method: BlockingMethod, run: () => Promise<T>): Promise<T> {
		if (this.#disposed || !this.#parentUI) return cancelledValue(method) as T;
		return new Promise<T>((resolve, reject) => {
			this.#queue.push({ context, method, run, resolve: resolve as (value: unknown) => void, reject });
			this.#updateStatus();
			void this.#drain();
		});
	}

	async #drain(): Promise<void> {
		if (this.#active) return;
		this.#active = true;
		try {
			while (!this.#disposed) {
				const item = this.#queue.shift();
				if (!item) break;
				this.#updateStatus(item.context);
				try {
					item.resolve(await item.run());
				} catch (error) {
					item.reject(error);
				}
			}
		} finally {
			this.#active = false;
			this.#updateStatus();
		}
	}

	#updateStatus(active?: SubagentInteractionContext): void {
		if (!this.#parentUI) return;
		const pending = this.#queue.length;
		if (active) this.#parentUI.setStatus(this.#statusKey, `Subagent UI: ${active.agent} · ${pending} queued`);
		else if (pending) this.#parentUI.setStatus(this.#statusKey, `Subagent UI: ${pending} queued`);
		else this.#parentUI.setStatus(this.#statusKey, undefined);
	}

	dispose(): void {
		this.#disposed = true;
		for (const item of this.#queue.splice(0)) item.resolve(cancelledValue(item.method));
		this.#parentUI?.setStatus(this.#statusKey, undefined);
	}
}
