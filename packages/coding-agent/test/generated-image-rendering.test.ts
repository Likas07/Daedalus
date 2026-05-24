import type { AssistantMessage } from "@daedalus-pi/ai";
import { describe, expect, it } from "vitest";
import { AssistantMessageComponent } from "../src/modes/interactive/components/assistant-message.js";

const fileUri = "file:///tmp/daedalus/generated-image.png";
const visiblePath = "/tmp/daedalus/generated-image.png";
const base64Data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
const osc8Link = `\u001b]8;;${fileUri}\u001b\\${visiblePath}\u001b]8;;\u001b\\`;

function createAssistantMessage(content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
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
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

function renderMessage(message: AssistantMessage): string {
	return new AssistantMessageComponent(message).render(120).join("\n");
}

describe("generated image rendering", () => {
	it("renders saved generated images as OSC 8 file links without inline image data", () => {
		const output = renderMessage(
			createAssistantMessage([
				{ type: "text", text: "Here is the image:" },
				{
					type: "generatedImage",
					id: "img-1",
					mimeType: "image/png",
					data: base64Data,
					path: visiblePath,
					fileUri,
					visiblePath,
					status: "completed",
				},
				{ type: "text", text: "Done." },
			]),
		);

		expect(output).toContain(`Generated image: ${osc8Link}`);
		expect(output).toContain(visiblePath);
		expect(output).toContain(fileUri);
		expect(output).not.toContain(base64Data);
		expect(output).not.toContain("\u001b_G");
		expect(output).not.toContain("\u001bPq");
	});

	it("renders a concise error line when a generated image has no file URI", () => {
		const output = renderMessage(
			createAssistantMessage([
				{
					type: "generatedImage",
					id: "img-2",
					mimeType: "image/png",
					status: "failed",
					error: "image generation failed",
				},
			]),
		);

		expect(output).toContain("Generated image failed: image generation failed");
		expect(output).not.toContain("\u001b_G");
		expect(output).not.toContain("\u001bPq");
	});
});
