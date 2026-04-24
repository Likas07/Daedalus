import { describe, expect, it } from "vitest";
import { truncateHeadAndTail } from "../../src/core/tools/truncate.js";

describe("truncateHeadAndTail", () => {
	it("returns full content when under the combined limits", () => {
		const content = ["alpha", "beta", "gamma"].join("\n");
		const result = truncateHeadAndTail(content, {
			maxPrefixLines: 2,
			maxSuffixLines: 2,
			maxPrefixBytes: 16,
			maxSuffixBytes: 16,
		});

		expect(result.truncated).toBe(false);
		expect(result.truncatedBy).toBeNull();
		expect(result.content).toBe(content);
		expect(result.totalLines).toBe(3);
		expect(result.outputLines).toBe(3);
	});

	it("keeps the requested prefix and suffix lines with a middle truncation marker", () => {
		const content = Array.from({ length: 1000 }, (_, index) => `Line ${index + 1}`).join("\n");

		const result = truncateHeadAndTail(content, {
			maxPrefixLines: 10,
			maxSuffixLines: 10,
		});

		const expected = [
			...Array.from({ length: 10 }, (_, index) => `Line ${index + 1}`),
			"[... 980 lines truncated ...]",
			...Array.from({ length: 10 }, (_, index) => `Line ${991 + index}`),
		].join("\n");

		expect(result.truncated).toBe(true);
		expect(result.truncatedBy).toBe("lines");
		expect(result.content).toBe(expected);
		expect(result.totalLines).toBe(1000);
		expect(result.outputLines).toBe(21);
	});

	it("keeps byte-bounded prefix and suffix content with a byte marker", () => {
		const content = "abcdefghijklmnopqrstuvwxyz";
		const result = truncateHeadAndTail(content, {
			maxPrefixBytes: 5,
			maxSuffixBytes: 4,
		});

		expect(result.truncated).toBe(true);
		expect(result.truncatedBy).toBe("bytes");
		expect(result.content).toBe("abcde\n[... 17 bytes truncated ...]\nwxyz");
	});

	it("never splits unicode code points when truncating by bytes", () => {
		const content = "🙂🙂🙂🙂🙂";
		const result = truncateHeadAndTail(content, {
			maxPrefixBytes: 5,
			maxSuffixBytes: 5,
		});

		expect(result.truncated).toBe(true);
		expect(result.content).toBe("🙂\n[... 12 bytes truncated ...]\n🙂");
		expect(result.content).not.toContain("�");
	});
});
