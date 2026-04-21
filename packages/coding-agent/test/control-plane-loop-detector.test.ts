import { describe, expect, it } from "vitest";
import { LoopDetector } from "../src/core/control-plane/loop-detector.js";

describe("LoopDetector", () => {
	it("flags repeated tool signatures", () => {
		const detector = new LoopDetector({ maxRepeats: 3 });

		expect(detector.record("read", { path: "src/auth.ts" })).toBe(false);
		expect(detector.record("read", { path: "src/auth.ts" })).toBe(false);
		expect(detector.record("read", { path: "src/auth.ts" })).toBe(true);
	});

	it("flags repeated completion attempts for the same active-work signature", () => {
		const detector = new LoopDetector({ maxRepeats: 3, maxCompletionAttempts: 3 });

		expect(detector.recordCompletionAttempt("active-a")).toBe(false);
		expect(detector.recordCompletionAttempt("active-a")).toBe(false);
		expect(detector.recordCompletionAttempt("active-a")).toBe(true);
	});

	it("resets completion attempts when active-work signature changes", () => {
		const detector = new LoopDetector({ maxRepeats: 3, maxCompletionAttempts: 2 });

		expect(detector.recordCompletionAttempt("active-a")).toBe(false);
		expect(detector.recordCompletionAttempt("active-b")).toBe(false);
		expect(detector.recordCompletionAttempt("active-b")).toBe(true);
	});
});
