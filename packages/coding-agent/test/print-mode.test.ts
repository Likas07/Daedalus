import type { AssistantMessage, ImageContent } from "@daedalus-pi/ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runPrintMode } from "../src/modes/print-mode.js";

type EmitEvent = { type: string };

type FakeExtensionRunner = {
	hasHandlers: (eventType: string) => boolean;
	emit: ReturnType<typeof vi.fn<(event: EmitEvent) => Promise<void>>>;
};

type FakeSession = {
	sessionManager: { getHeader: () => object | undefined };
	agent: { waitForIdle: () => Promise<void> };
	state: { messages: AssistantMessage[] };
	extensionRunner: FakeExtensionRunner;
	bindExtensions: ReturnType<typeof vi.fn>;
	subscribe: ReturnType<typeof vi.fn>;
	prompt: ReturnType<typeof vi.fn>;
	reload: ReturnType<typeof vi.fn>;
};

type FakeRuntimeHost = {
	session: FakeSession;
	newSession: ReturnType<typeof vi.fn>;
	fork: ReturnType<typeof vi.fn>;
	switchSession: ReturnType<typeof vi.fn>;
	dispose: ReturnType<typeof vi.fn>;
};

function createAssistantMessage(options?: {
	text?: string;
	content?: AssistantMessage["content"];
	stopReason?: AssistantMessage["stopReason"];
	errorMessage?: string;
}): AssistantMessage {
	return {
		role: "assistant",
		content: options?.content ?? (options?.text ? [{ type: "text", text: options.text }] : []),
		api: "openai-responses",
		provider: "openai",
		model: "gpt-4o-mini",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: options?.stopReason ?? "stop",
		errorMessage: options?.errorMessage,
		timestamp: Date.now(),
	};
}

function createRuntimeHost(assistantMessage: AssistantMessage): FakeRuntimeHost {
	const extensionRunner: FakeExtensionRunner = {
		hasHandlers: (eventType: string) => eventType === "session_shutdown",
		emit: vi.fn(async () => {}),
	};

	const state = { messages: [assistantMessage] };

	const session: FakeSession = {
		sessionManager: { getHeader: () => undefined },
		agent: { waitForIdle: async () => {} },
		state,
		extensionRunner,
		bindExtensions: vi.fn(async () => {}),
		subscribe: vi.fn(() => () => {}),
		prompt: vi.fn(async () => {}),
		reload: vi.fn(async () => {}),
	};

	return {
		session,
		newSession: vi.fn(async () => undefined),
		fork: vi.fn(async () => ({ selectedText: "" })),
		switchSession: vi.fn(async () => undefined),
		dispose: vi.fn(async () => {
			await session.extensionRunner.emit({ type: "session_shutdown" });
		}),
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("runPrintMode", () => {
	it("emits session_shutdown in text mode", async () => {
		const runtimeHost = createRuntimeHost(createAssistantMessage({ text: "done" }));
		const { session } = runtimeHost;
		const images: ImageContent[] = [{ type: "image", mimeType: "image/png", data: "abc" }];

		const exitCode = await runPrintMode(runtimeHost as unknown as Parameters<typeof runPrintMode>[0], {
			mode: "text",
			initialMessage: "Say done",
			initialImages: images,
		});

		expect(exitCode).toBe(0);
		expect(session.prompt).toHaveBeenCalledWith("Say done", { images });
		expect(session.extensionRunner.emit).toHaveBeenCalledTimes(1);
		expect(session.extensionRunner.emit).toHaveBeenCalledWith({ type: "session_shutdown" });
	});

	it("emits session_shutdown in json mode", async () => {
		const runtimeHost = createRuntimeHost(createAssistantMessage({ text: "done" }));
		const { session } = runtimeHost;

		const exitCode = await runPrintMode(runtimeHost as unknown as Parameters<typeof runPrintMode>[0], {
			mode: "json",
			messages: ["hello"],
		});

		expect(exitCode).toBe(0);
		expect(session.prompt).toHaveBeenCalledWith("hello");
		expect(session.extensionRunner.emit).toHaveBeenCalledTimes(1);
		expect(session.extensionRunner.emit).toHaveBeenCalledWith({ type: "session_shutdown" });
	});

	it("emits session_shutdown and returns non-zero on assistant error", async () => {
		const runtimeHost = createRuntimeHost(
			createAssistantMessage({ stopReason: "error", errorMessage: "provider failure" }),
		);
		const { session } = runtimeHost;
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const exitCode = await runPrintMode(runtimeHost as unknown as Parameters<typeof runPrintMode>[0], {
			mode: "text",
		});

		expect(exitCode).toBe(1);
		expect(errorSpy).toHaveBeenCalledWith("provider failure");
		expect(session.extensionRunner.emit).toHaveBeenCalledTimes(1);
		expect(session.extensionRunner.emit).toHaveBeenCalledWith({ type: "session_shutdown" });
	});

	it("prints generated image OSC 8 file links in text mode without inline image data", async () => {
		const fileUri = "file:///tmp/daedalus/print-image.png";
		const visiblePath = "/tmp/daedalus/print-image.png";
		const base64Data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
		const runtimeHost = createRuntimeHost(
			createAssistantMessage({
				content: [
					{ type: "text", text: "created" },
					{
						type: "generatedImage",
						id: "img-print",
						mimeType: "image/png",
						data: base64Data,
						path: visiblePath,
						fileUri,
						visiblePath,
						status: "completed",
					},
				],
			}),
		);
		const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((...args: unknown[]) => {
			const callback = args.find((arg): arg is () => void => typeof arg === "function");
			callback?.();
			return true;
		});

		const exitCode = await runPrintMode(runtimeHost as unknown as Parameters<typeof runPrintMode>[0], {
			mode: "text",
		});

		const stdout = stdoutSpy.mock.calls.map((call) => String(call[0])).join("");
		expect(exitCode).toBe(0);
		expect(stdout).toContain("created\n");
		expect(stdout).toContain(`Generated image: \u001b]8;;${fileUri}\u001b\\${visiblePath}\u001b]8;;\u001b\\\n`);
		expect(stdout).not.toContain(base64Data);
		expect(stdout).not.toContain("\u001b_G");
		expect(stdout).not.toContain("\u001bPq");
	});

	it("prints generated image errors when no file URI is available", async () => {
		const runtimeHost = createRuntimeHost(
			createAssistantMessage({
				content: [
					{
						type: "generatedImage",
						id: "img-error",
						mimeType: "image/png",
						status: "failed",
						error: "image generation failed",
					},
				],
			}),
		);
		const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((...args: unknown[]) => {
			const callback = args.find((arg): arg is () => void => typeof arg === "function");
			callback?.();
			return true;
		});

		const exitCode = await runPrintMode(runtimeHost as unknown as Parameters<typeof runPrintMode>[0], {
			mode: "text",
		});

		const stdout = stdoutSpy.mock.calls.map((call) => String(call[0])).join("");
		expect(exitCode).toBe(0);
		expect(stdout).toContain("Generated image failed: image generation failed\n");
	});
});
