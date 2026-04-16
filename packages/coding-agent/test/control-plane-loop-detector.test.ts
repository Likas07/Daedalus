import { describe, expect, it } from "vitest";
import { LoopDetector } from "../src/core/control-plane/loop-detector.js";

describe("LoopDetector", () => {
	it("flags repeated tool signatures", () => {
		const detector = new LoopDetector({ maxRepeats: 3 });

		expect(detector.record("read", { path: "src/auth.ts" })).toBe(false);
		expect(detector.record("read", { path: "src/auth.ts" })).toBe(false);
		expect(detector.record("read", { path: "src/auth.ts" })).toBe(true);
	});
});
