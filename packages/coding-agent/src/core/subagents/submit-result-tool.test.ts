import { describe, expect, test } from "bun:test";
import { createSubmitResultTool, DEFAULT_MAX_INVALID_SUBMIT_ATTEMPTS } from "./submit-result-tool.js";

type SubmitResultTool = ReturnType<typeof createSubmitResultTool>;
type SubmitResultParams = Parameters<SubmitResultTool["execute"]>[1];

function execute(tool: SubmitResultTool, callId: string, params: SubmitResultParams) {
	return tool.execute(callId, params, undefined, undefined, {} as any);
}

describe("createSubmitResultTool", () => {
	test("invalid envelope returns actionable error and can be retried", async () => {
		const submitted: unknown[] = [];
		const rejected: unknown[] = [];
		const tool = createSubmitResultTool((payload) => submitted.push(payload), {
			onInvalidSubmit: (event) => rejected.push(event.rawParams),
		});

		await expect(
			execute(tool, "call-1", { task: "t", status: "failed", summary: "bad", output: "o", extra: "x" } as any),
		).rejects.toThrow("Invalid submit_result envelope");
		expect(submitted).toEqual([]);
		expect(rejected).toHaveLength(1);

		await expect(
			execute(tool, "call-2", { task: "t", status: "completed", summary: "ok", output: "o" } as any),
		).resolves.toMatchObject({ content: [{ type: "text", text: "Result submitted." }] });
		expect(submitted).toEqual([{ task: "t", status: "completed", summary: "ok", output: "o" }]);
	});

	test("repairs non-string output and strips extra properties before accepting", async () => {
		let submitted: unknown;
		const tool = createSubmitResultTool((payload) => {
			submitted = payload;
		});
		await execute(tool, "call-1", {
			task: "t",
			status: "complete",
			summary: "ok",
			output: { ok: true },
			extra: "x",
		} as any);
		expect(submitted).toEqual({
			task: "t",
			status: "completed",
			summary: "ok",
			output: JSON.stringify({ ok: true }, null, 2),
		});
	});

	test("caps invalid submit attempts and never accepts after exhaustion", async () => {
		const submitted: unknown[] = [];
		const rejected: unknown[] = [];
		const tool = createSubmitResultTool((payload) => submitted.push(payload), {
			maxInvalidAttempts: 2,
			onInvalidSubmit: (event) => rejected.push(event),
		});
		await expect(
			execute(tool, "call-1", { task: "t", status: "failed", summary: "s", output: "o" } as any),
		).rejects.toThrow("attempt 1 of 2");
		await expect(
			execute(tool, "call-2", { task: "t", status: "failed", summary: "s", output: "o" } as any),
		).rejects.toThrow("submit_result invalid attempt limit reached");
		await expect(
			execute(tool, "call-3", { task: "t", status: "completed", summary: "s", output: "o" } as any),
		).rejects.toThrow("submit_result invalid attempt limit reached");
		expect(submitted).toEqual([]);
		expect(rejected).toMatchObject([
			{ attempt: 1, maxAttempts: 2 },
			{ attempt: 2, maxAttempts: 2 },
		]);
	});

	test("uses three invalid attempts by default", async () => {
		expect(DEFAULT_MAX_INVALID_SUBMIT_ATTEMPTS).toBe(3);
		const tool = createSubmitResultTool(() => {});
		for (let attempt = 1; attempt < DEFAULT_MAX_INVALID_SUBMIT_ATTEMPTS; attempt += 1) {
			await expect(
				execute(tool, `call-${attempt}`, { task: "t", status: "failed", summary: "s", output: "o" } as any),
			).rejects.toThrow(`attempt ${attempt} of ${DEFAULT_MAX_INVALID_SUBMIT_ATTEMPTS}`);
		}
		await expect(
			execute(tool, "call-3", { task: "t", status: "failed", summary: "s", output: "o" } as any),
		).rejects.toThrow("submit_result invalid attempt limit reached");
	});

	test("preserves submit_result may only be called once after a valid submit", async () => {
		const submitted: unknown[] = [];
		const tool = createSubmitResultTool((payload) => submitted.push(payload));
		await execute(tool, "call-1", { task: "t", status: "completed", summary: "ok", output: "o" } as any);
		await expect(
			execute(tool, "call-2", { task: "t", status: "completed", summary: "ok", output: "o" } as any),
		).rejects.toThrow("submit_result may only be called once");
		expect(submitted).toEqual([{ task: "t", status: "completed", summary: "ok", output: "o" }]);
	});
});
