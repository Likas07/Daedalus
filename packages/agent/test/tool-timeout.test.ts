import { describe, expect, it } from "vitest";
import { ToolTimeoutError, withToolTimeout } from "../src/tool-timeout.js";

describe("withToolTimeout", () => {
	it("passes through fast tool results", async () => {
		await expect(withToolTimeout("fast", 100, undefined, async () => "ok")).resolves.toBe("ok");
	});

	it("times out slow tools with a clear error", async () => {
		await expect(
			withToolTimeout("slow", 25, undefined, async (signal) => {
				await new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(signal.reason), { once: true });
				});
				return "never";
			}),
		).rejects.toMatchObject({
			name: "ToolTimeoutError",
			message: "Tool slow timed out after 25ms",
		});
	});

	it("does not misclassify external aborts as timeouts", async () => {
		const controller = new AbortController();
		const promise = withToolTimeout("slow", 1000, controller.signal, async (signal) => {
			await new Promise((_resolve, reject) => {
				signal.addEventListener("abort", () => reject(signal.reason), { once: true });
			});
			return "never";
		});

		controller.abort(new Error("cancelled by caller"));
		await expect(promise).rejects.toThrow("cancelled by caller");
		await promise.catch((error) => {
			expect(error).not.toBeInstanceOf(ToolTimeoutError);
		});
	});

	it("rejects on parent abort when timeout is undefined", async () => {
		const controller = new AbortController();
		const promise = withToolTimeout("infinite", undefined, controller.signal, async () => {
			await new Promise(() => {});
			return "never";
		});

		controller.abort(new Error("cancelled without timeout"));

		await expect(promise).rejects.toThrow("cancelled without timeout");
		await promise.catch((error) => {
			expect(error).not.toBeInstanceOf(ToolTimeoutError);
		});
	});

	it("rejects immediately when parent signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort(new Error("already cancelled"));

		const fn = async () => "never";
		await expect(withToolTimeout("already-aborted", undefined, controller.signal, fn)).rejects.toThrow(
			"already cancelled",
		);
	});
});
