import type {
	ExtensionId,
	ExtensionUiRequest,
	ExtensionUiRequestId,
	ExtensionUiResponse,
	ServerNotification,
	ServerRequest,
	SessionId,
} from "@daedalus-pi/app-server-protocol";
import type { ExtensionUiRouter } from "./extension-ui-router";
export interface ExtensionUIDialogOptions {
	readonly signal?: AbortSignal;
	readonly timeout?: number;
}

export interface ExtensionWidgetOptions {
	readonly placement?: "aboveEditor" | "belowEditor";
}

export type TerminalInputHandler = (data: string) => { consume?: boolean; data?: string } | undefined;

export type ExtensionBridgeEmit = (message: ServerRequest | ServerNotification) => void | Promise<void>;
export type ExtensionBridgeWarningSink = (warning: ExtensionBridgeCompatibilityWarning) => void;

export interface ExtensionBridgeCompatibilityWarning {
	readonly feature: string;
	readonly message: string;
}

export interface ExtensionUIBridgeOptions {
	readonly extensionId: ExtensionId;
	readonly sessionId?: SessionId;
	readonly emit: ExtensionBridgeEmit;
	readonly router?: ExtensionUiRouter;
	readonly nextRequestId?: () => ExtensionUiRequestId;
	readonly warn?: ExtensionBridgeWarningSink;
}

export class ExtensionUIBridge {
	private readonly pending = new Map<ExtensionUiRequestId, (response: ExtensionUiResponse) => void>();

	constructor(private readonly options: ExtensionUIBridgeOptions) {}

	async select(title: string, options: string[], opts?: ExtensionUIDialogOptions): Promise<string | undefined> {
		const response = await this.request({
			title,
			description: this.dialogDescription(opts),
			fields: [
				{ id: "value", label: title, type: "select", options: options.map((value) => ({ label: value, value })) },
			],
			actions: this.actions(opts),
		});
		return response.actionId === "cancel" ? undefined : (response.values.value as string | undefined);
	}

	async confirm(title: string, message: string, _opts?: ExtensionUIDialogOptions): Promise<boolean> {
		const response = await this.request({
			title,
			description: message,
			fields: [],
			actions: [
				{ id: "confirm", label: "Confirm", style: "primary" },
				{ id: "cancel", label: "Cancel", style: "secondary" },
			],
		});
		return response.actionId === "confirm";
	}

	async input(title: string, placeholder?: string, opts?: ExtensionUIDialogOptions): Promise<string | undefined> {
		const response = await this.request({
			title,
			description: this.dialogDescription(opts),
			fields: [{ id: "value", label: title, type: "text", placeholder }],
			actions: this.actions(opts),
		});
		return response.actionId === "cancel" ? undefined : (response.values.value as string | undefined);
	}

	async editor(title: string, prefill?: string): Promise<string | undefined> {
		const response = await this.request({
			title,
			fields: [{ id: "value", label: title, type: "textarea", defaultValue: prefill }],
			actions: this.actions(),
		});
		return response.actionId === "cancel" ? undefined : (response.values.value as string | undefined);
	}

	notify(message: string, type: "info" | "warning" | "error" = "info"): void {
		void this.emitNotification("extension/ui/notify", {
			extensionId: this.options.extensionId,
			sessionId: this.options.sessionId,
			message,
			type,
		});
	}

	onTerminalInput(_handler: TerminalInputHandler): () => void {
		this.warn(
			"onTerminalInput",
			"Terminal input hooks are not supported by the GUI bridge; returning a no-op unsubscribe.",
		);
		return () => {};
	}

	setStatus(key: string, text: string | undefined): void {
		void this.emitNotification("extension/ui/status", {
			extensionId: this.options.extensionId,
			sessionId: this.options.sessionId,
			key,
			text,
		});
	}

	setWorkingMessage(message?: string): void {
		void this.emitNotification("extension/ui/workingMessage", {
			extensionId: this.options.extensionId,
			sessionId: this.options.sessionId,
			message,
		});
	}

	setHiddenThinkingLabel(label?: string): void {
		void this.emitNotification("extension/ui/hiddenThinkingLabel", {
			extensionId: this.options.extensionId,
			sessionId: this.options.sessionId,
			label,
		});
	}

	setWidget(key: string, content: unknown, options?: ExtensionWidgetOptions): void {
		if (typeof content === "function")
			this.warn("setWidget", "Component widgets are not serializable; emitting an empty compatibility placeholder.");
		void this.emitNotification("extension/ui/widget", {
			extensionId: this.options.extensionId,
			sessionId: this.options.sessionId,
			key,
			content: typeof content === "function" ? undefined : content,
			options,
		});
	}

	setFooter(): void {
		this.warn("setFooter", "Custom footer components are not supported by the GUI bridge.");
	}
	setHeader(): void {
		this.warn("setHeader", "Custom header components are not supported by the GUI bridge.");
	}

	setTitle(title: string): void {
		void this.emitNotification("extension/ui/title", {
			extensionId: this.options.extensionId,
			sessionId: this.options.sessionId,
			title,
		});
	}

	async custom<T>(): Promise<T> {
		this.warn("custom", "Custom component UI is not supported by the GUI bridge.");
		throw new Error("Extension custom UI is not supported by the app-server GUI bridge");
	}

	pasteToEditor(text: string): void {
		this.setEditorText(text);
	}
	setEditorText(text: string): void {
		void this.emitNotification("extension/ui/editorText", {
			extensionId: this.options.extensionId,
			sessionId: this.options.sessionId,
			text,
		});
	}
	getEditorText(): string {
		this.warn("getEditorText", "Reading GUI editor text is not supported; returning an empty string fallback.");
		return "";
	}
	setEditor(): void {
		this.warn("setEditor", "Custom editor components are not supported by the GUI bridge.");
	}

	respond(response: ExtensionUiResponse): boolean {
		const resolve = this.pending.get(response.requestId);
		if (!resolve) return false;
		this.pending.delete(response.requestId);
		resolve(response);
		return true;
	}

	cancelPending(reason = "Extension UI bridge disposed"): void {
		for (const [requestId, resolve] of [...this.pending]) {
			this.pending.delete(requestId);
			resolve({ requestId, actionId: "cancel", values: {} });
		}
		if (this.options.sessionId) this.options.router?.cancelSession(this.options.sessionId, reason);
	}

	private async request(
		input: Omit<ExtensionUiRequest, "requestId" | "extensionId" | "sessionId">,
	): Promise<ExtensionUiResponse> {
		const requestId = this.nextRequestId();
		const request: ExtensionUiRequest = {
			requestId,
			extensionId: this.options.extensionId,
			sessionId: this.options.sessionId,
			...input,
		};
		if (this.options.router) return this.options.router.request(request);
		const promise = new Promise<ExtensionUiResponse>((resolve) => this.pending.set(requestId, resolve));
		await this.options.emit({ kind: "request", id: requestId, method: "extension/ui/request", params: request });
		return promise;
	}

	private actions(_opts?: ExtensionUIDialogOptions): ExtensionUiRequest["actions"] {
		return [
			{ id: "submit", label: "OK", style: "primary" },
			{ id: "cancel", label: "Cancel", style: "secondary" },
		];
	}

	private dialogDescription(opts?: ExtensionUIDialogOptions): string | undefined {
		if (opts?.timeout) return `This prompt will time out after ${opts.timeout}ms.`;
		return undefined;
	}

	private nextRequestId(): ExtensionUiRequestId {
		return this.options.nextRequestId?.() ?? `ext-ui-${crypto.randomUUID()}`;
	}
	private async emitNotification(method: string, params: Record<string, unknown>): Promise<void> {
		await this.options.emit({ kind: "notification", method, params } as ServerNotification);
	}
	private warn(feature: string, message: string): void {
		this.options.warn?.({ feature, message });
	}
}
