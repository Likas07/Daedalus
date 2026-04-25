import { describe, expect, test } from "bun:test";
import { isUrlServing, waitForUrl } from "./dev";

describe("desktop dev launcher helpers", () => {
	test("isUrlServing returns true only for successful responses", async () => {
		expect(await isUrlServing("http://example.test", async () => new Response("ok", { status: 200 }))).toBe(true);
		expect(await isUrlServing("http://example.test", async () => new Response("missing", { status: 404 }))).toBe(
			false,
		);
		expect(
			await isUrlServing("http://example.test", async () => {
				throw new Error("connection refused");
			}),
		).toBe(false);
	});

	test("waitForUrl waits until a URL serves successfully", async () => {
		let attempts = 0;
		await waitForUrl("http://example.test", {
			intervalMs: 1,
			timeoutMs: 100,
			fetcher: async () => {
				attempts += 1;
				return new Response("ok", { status: attempts >= 3 ? 200 : 503 });
			},
		});
		expect(attempts).toBe(3);
	});

	test("waitForUrl reports timeout when a URL never serves", async () => {
		await expect(
			waitForUrl("http://example.test", {
				intervalMs: 1,
				timeoutMs: 5,
				fetcher: async () => new Response("not ready", { status: 503 }),
			}),
		).rejects.toThrow("Timed out waiting for http://example.test: HTTP 503");
	});
});
