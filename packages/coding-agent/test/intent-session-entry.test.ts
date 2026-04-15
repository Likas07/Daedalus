import { describe, expect, test } from "vitest";
import { getLatestIntentEntry, SessionManager } from "../src/core/session-manager.js";
import { assistantMsg, userMsg } from "./utilities.js";

describe("session manager intent entries", () => {
	test("persists intent entries outside llm context", () => {
		const session = SessionManager.inMemory("/repo");
		session.appendMessage(userMsg("Plan this"));
		session.appendMessage(assistantMsg("Intent: planning — inspect context and write plan docs only."));
		session.appendIntent(
			0,
			{
				trueIntent: "planning",
				approach: "inspect context and write plan docs only.",
				readOnly: false,
				mutationScope: "docs-only",
				planningArtifactKind: "plan",
				source: "assistant-line",
				valid: true,
			},
			"user-1",
			"assistant-1",
		);

		const branch = session.getBranch();
		expect(getLatestIntentEntry(branch)?.metadata.trueIntent).toBe("planning");
		expect(session.getIntentEntries()).toHaveLength(1);
		expect(session.buildSessionContext().messages).toHaveLength(2);
	});
});
