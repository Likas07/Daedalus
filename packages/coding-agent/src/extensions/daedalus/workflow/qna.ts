import { complete, type UserMessage } from "@daedalus-pi/ai";
import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { BorderedLoader } from "@daedalus-pi/coding-agent";
import { requireModel, requireUI } from "../shared/ui.js";
import { resolveModelAuth } from "../shared/model-auth.js";

const SYSTEM_PROMPT = `You are a question extractor. Given text from a conversation, extract any questions that need answering and format them for the user to fill in.

Output format:
- List each question on its own line, prefixed with "Q: "
- After each question, add a blank line for the answer prefixed with "A: "
- If no questions are found, output "No questions found in the last message."

Example output:
Q: What is your preferred database?
A: 

Q: Should we use TypeScript or JavaScript?
A: 

Keep questions in the order they appeared. Be concise.`;

export default function (pi: ExtensionAPI) {
	pi.registerCommand("qna", {
		description: "Extract questions from last assistant message into editor",
		handler: async (_args, ctx) => {
			if (!requireUI(ctx, "qna")) return;
			if (!requireModel(ctx)) return;

			const branch = ctx.sessionManager.getBranch();
			let lastAssistantText: string | undefined;

			for (let i = branch.length - 1; i >= 0; i--) {
				const entry = branch[i];
				if (entry?.type === "message") {
					const msg = entry.message;
					if ("role" in msg && msg.role === "assistant") {
						if (msg.stopReason !== "stop") {
							ctx.ui.notify(`Last assistant message incomplete (${msg.stopReason})`, "error");
							return;
						}
						const textParts = msg.content
							.filter((c): c is { type: "text"; text: string } => c.type === "text")
							.map((c) => c.text);
						if (textParts.length > 0) {
							lastAssistantText = textParts.join("\n");
							break;
						}
					}
				}
			}

			if (!lastAssistantText) {
				ctx.ui.notify("No assistant messages found", "error");
				return;
			}

			const model = ctx.model;
			if (!model) return;
			const assistantText = lastAssistantText;

			const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
				const loader = new BorderedLoader(tui, theme, `Extracting questions using ${model.id}...`);
				loader.onAbort = () => done(null);

				const doExtract = async () => {
					const auth = await resolveModelAuth(ctx);
					const userMessage: UserMessage = {
						role: "user",
						content: [{ type: "text", text: assistantText }],
						timestamp: Date.now(),
					};

					const response = await complete(
						model,
						{ systemPrompt: SYSTEM_PROMPT, messages: [userMessage] },
						{ apiKey: auth.apiKey, headers: auth.headers, signal: loader.signal },
					);

					if (response.stopReason === "aborted") {
						return null;
					}

					return response.content
						.filter((c): c is { type: "text"; text: string } => c.type === "text")
						.map((c) => c.text)
						.join("\n");
				};

				doExtract()
					.then(done)
					.catch(() => done(null));

				return loader;
			});

			if (result === null) {
				ctx.ui.notify("Cancelled", "info");
				return;
			}

			ctx.ui.setEditorText(result);
			ctx.ui.notify("Questions loaded. Edit and submit when ready.", "info");
		},
	});
}
