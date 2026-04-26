import { describe, expect, test } from "bun:test";
import { createComposerSubmitContext, type ComposerSubmitContext } from "../../client/composer-state";

describe("composer submit context", () => {
	const fullContext: ComposerSubmitContext = {
		prompt: "implement composer context",
		attachmentIds: ["attachment-a", "attachment-b"],
		filePaths: ["src/App.svelte", "src/App.svelte", "src/client/runtime.ts"],
		model: "claude-sonnet-4-5",
		effort: "high",
		accessMode: "auto-accept",
		mode: "daedalus",
		fastMode: true,
		projectId: "project-1",
		worktreeId: "worktree-1",
		sessionId: "session-1",
	};

	test("preserves full context for new session submission", () => {
		expect(createComposerSubmitContext(fullContext)).toEqual({
			...fullContext,
			filePaths: ["src/App.svelte", "src/client/runtime.ts"],
		});
	});

	test("preserves full context for active-session turns", () => {
		const turn = createComposerSubmitContext({
			...fullContext,
			prompt: "follow up",
			sessionId: "session-active",
		});

		expect(turn).toEqual({
			...fullContext,
			prompt: "follow up",
			filePaths: ["src/App.svelte", "src/client/runtime.ts"],
			sessionId: "session-active",
		});
	});

	test("copies mutable arrays before submit", () => {
		const source = { ...fullContext, attachmentIds: ["a"], filePaths: ["one.ts"] };
		const context = createComposerSubmitContext(source);
		source.attachmentIds.push("b");
		source.filePaths.push("two.ts");

		expect(context.attachmentIds).toEqual(["a"]);
		expect(context.filePaths).toEqual(["one.ts"]);
	});
});
