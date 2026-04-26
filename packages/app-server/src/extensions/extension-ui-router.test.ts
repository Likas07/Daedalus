import { describe, expect, test } from "bun:test";
import type { ExtensionUiRequest, ServerNotification, ServerRequest } from "@daedalus-pi/app-server-protocol";
import { ExtensionUIBridge } from "./extension-ui-bridge";
import { ExtensionUiRouter } from "./extension-ui-router";

function request(kind: "select" | "confirm" | "input" | "editor", requestId: string = kind): ExtensionUiRequest {
	return {
		requestId,
		extensionId: "ext.test",
		sessionId: "session-1",
		title: kind,
		fields:
			kind === "confirm"
				? []
				: [
						{
							id: "value",
							label: kind,
							type: kind === "editor" ? "textarea" : kind === "select" ? "select" : "text",
							options: kind === "select" ? [{ label: "A", value: "a" }] : undefined,
						},
					],
		actions: [
			{ id: "submit", label: "OK" },
			{ id: "cancel", label: "Cancel" },
		],
	};
}

describe("ExtensionUiRouter", () => {
	test("routes select, confirm, input, and editor responses through registered request ids", async () => {
		const messages: Array<ServerRequest | ServerNotification> = [];
		const router = new ExtensionUiRouter((message) => {
			messages.push(message);
		});
		let next = 0;
		const bridge = new ExtensionUIBridge({
			extensionId: "ext.test",
			sessionId: "session-1",
			router,
			emit: (message) => {
				messages.push(message);
			},
			nextRequestId: () => ["select", "confirm", "input", "editor"][next++],
		});

		const selected = bridge.select("Pick", ["a"]);
		router.respond({ requestId: "select", actionId: "submit", values: { value: "a" } });
		expect(await selected).toBe("a");

		const confirmed = bridge.confirm("Confirm", "Continue?");
		router.respond({ requestId: "confirm", actionId: "confirm", values: {} });
		expect(await confirmed).toBe(true);

		const input = bridge.input("Name");
		router.respond({ requestId: "input", actionId: "submit", values: { value: "Ada" } });
		expect(await input).toBe("Ada");

		const editor = bridge.editor("Edit", "draft");
		router.respond({ requestId: "editor", actionId: "submit", values: { value: "final" } });
		expect(await editor).toBe("final");
		expect(messages.filter((message) => message.kind === "request")).toHaveLength(4);
		expect(router.size).toBe(0);
	});

	test("close cancels a pending response", async () => {
		const router = new ExtensionUiRouter();
		const promise = router.request(request("input", "close-1"));
		router.close("close-1");
		expect(await promise).toEqual({ requestId: "close-1", actionId: "cancel", values: {} });
	});

	test("unknown or expired ids throw", () => {
		const router = new ExtensionUiRouter();
		expect(() => router.respond({ requestId: "missing", actionId: "submit", values: {} })).toThrow(
			"Unknown or expired",
		);
		expect(() => router.close("missing")).toThrow("Unknown or expired");
	});

	test("session disposal cancels only matching pending requests", async () => {
		const router = new ExtensionUiRouter();
		const first = router.request(request("input", "one"));
		const secondRequest = { ...request("input", "two"), sessionId: "session-2" };
		const second = router.request(secondRequest);
		router.cancelSession("session-1", "disposed");
		expect(await first).toEqual({ requestId: "one", actionId: "cancel", values: {} });
		expect(router.has("two")).toBe(true);
		router.respond({ requestId: "two", actionId: "submit", values: { value: "kept" } });
		expect(await second).toEqual({ requestId: "two", actionId: "submit", values: { value: "kept" } });
	});
});
