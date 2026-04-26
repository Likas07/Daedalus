import type { BrowserWindow } from "electron";
import { isSafeExternalUrl } from "./native-bridge";

export type NativeCommandId =
	| "open-project"
	| "open-recent-project"
	| "open-file"
	| "open-folder"
	| "open-external-editor"
	| "toggle-terminal"
	| "export-diagnostics"
	| "open-deep-link"
	| "show-notification";

export interface NativeCommandPayloads {
	readonly "open-project": { readonly path: string };
	readonly "open-recent-project": { readonly path: string };
	readonly "open-file": { readonly path?: string };
	readonly "open-folder": { readonly path?: string };
	readonly "open-external-editor": { readonly path?: string };
	readonly "toggle-terminal": Record<string, never>;
	readonly "export-diagnostics": Record<string, never>;
	readonly "open-deep-link": { readonly url: string };
	readonly "show-notification": { readonly kind: "approval" | "run-completed" | "run-failed" | "provider-error"; readonly body?: string };
}

export type NativeCommandEnvelope<K extends NativeCommandId = NativeCommandId> = {
	readonly [P in K]: { readonly id: P; readonly payload: NativeCommandPayloads[P] };
}[K];

export interface NativeCommandRouterOptions {
	readonly getMainWindow: () => Pick<BrowserWindow, "webContents"> | undefined;
	readonly channel?: string;
}

export const nativeCommandChannel = "daedalus:native-command";

export class NativeCommandRouter {
	readonly #getMainWindow: () => Pick<BrowserWindow, "webContents"> | undefined;
	readonly #channel: string;

	constructor(options: NativeCommandRouterOptions) {
		this.#getMainWindow = options.getMainWindow;
		this.#channel = options.channel ?? nativeCommandChannel;
	}

	send<K extends NativeCommandId>(id: K, payload: NativeCommandPayloads[K]): NativeCommandEnvelope<K> {
		const command = validateNativeCommand({ id, payload } as NativeCommandEnvelope) as NativeCommandEnvelope<K>;
		this.#getMainWindow()?.webContents.send(this.#channel, command);
		return command;
	}
}

export function validateNativeCommand(command: NativeCommandEnvelope): NativeCommandEnvelope {
	if (("path" in command.payload && typeof command.payload.path === "string" && command.payload.path.length === 0)) {
		throw new Error("Native command path must not be empty");
	}
	if (command.id === "open-deep-link") {
		const url = command.payload.url;
		if (!isSafeExternalUrl(url) && !url.startsWith("daedalus://")) throw new Error("Unsupported native command URL");
	}

	return command;
}
