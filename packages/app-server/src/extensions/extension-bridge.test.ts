import { describe, expect, test } from "bun:test";
import type { ServerNotification, ServerRequest } from "@daedalus-pi/app-server-protocol";
import { ExtensionUIBridge } from "./extension-ui-bridge";

describe("ExtensionUIBridge", () => {
	test("blocks confirm until an extension UI response arrives", async () => {
		const messages: Array<ServerRequest | ServerNotification> = [];
		const bridge = new ExtensionUIBridge({
			extensionId: "ext.test",
			sessionId: "session-1",
			nextRequestId: () => "request-1",
			emit: (message) => {
				messages.push(message);
			},
		});

		let resolved: boolean | undefined;
		const promise = bridge.confirm("Confirm action", "Continue?").then((value) => {
			resolved = value;
			return value;
		});
		await Promise.resolve();

		expect(resolved).toBeUndefined();
		expect(messages).toEqual([
			{
				kind: "request",
				id: "request-1",
				method: "extension/ui/request",
				params: {
					requestId: "request-1",
					extensionId: "ext.test",
					sessionId: "session-1",
					title: "Confirm action",
					description: "Continue?",
					fields: [],
					actions: [
						{ id: "confirm", label: "Confirm", style: "primary" },
						{ id: "cancel", label: "Cancel", style: "secondary" },
					],
				},
			},
		]);

		expect(bridge.respond({ requestId: "request-1", actionId: "confirm", values: {} })).toBe(true);
		expect(await promise).toBe(true);
		expect(resolved).toBe(true);
	});
});
