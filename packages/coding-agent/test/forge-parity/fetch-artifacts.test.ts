import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import stripAnsi from "strip-ansi";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ArtifactStore } from "../../src/core/tools/artifact-store.js";
import { createFetchToolDefinition } from "../../src/core/tools/fetch.js";
import { initTheme, theme } from "../../src/modes/interactive/theme/theme.js";

function response(body: string, contentType = "text/plain"): Response {
	return new Response(body, {
		status: 200,
		headers: { "content-type": contentType },
	});
}

function text(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content.map((c) => c.text ?? "").join("\n");
}

function renderText(component: { render: (width: number) => string[] }, width = 120): string {
	return stripAnsi(component.render(width).join("\n"));
}

describe("fetch long-output artifacts", () => {
	let agentDir: string;

	beforeAll(() => {
		initTheme(undefined, false);
	});

	beforeEach(() => {
		agentDir = join(tmpdir(), `daedalus-fetch-artifacts-${Date.now()}-${Math.random().toString(16).slice(2)}`);
	});

	afterEach(() => {
		rmSync(agentDir, { recursive: true, force: true });
	});

	it("saves full fetched content to an artifact when over maxFetchChars with a sanitized visible path", async () => {
		const body = "x".repeat(1200);
		const store = new ArtifactStore("session-f", agentDir);
		const tool = createFetchToolDefinition(process.cwd(), {
			artifactStore: store,
			toolOutputs: { maxFetchChars: 500 },
			operations: { fetch: async () => response(body) },
		});

		const result = await tool.execute("fetch/1", { url: "https://example.com" }, undefined, undefined, {} as any);
		const artifactPath = result.details?.fetchArtifactPath;
		expect(artifactPath).toBeDefined();
		expect(existsSync(artifactPath!)).toBe(true);
		expect(readFileSync(artifactPath!, "utf8")).toBe(body);
		expect(result.details?.truncated).toBe(true);
		expect(text(result)).not.toContain(artifactPath!);
		expect(text(result)).toContain("artifacts/session-f/fetch-1-fetch.txt");
	});

	it("renders the fetch artifact notice exactly once", async () => {
		const body = "x".repeat(1200);
		const store = new ArtifactStore("session-f", agentDir);
		const tool = createFetchToolDefinition(process.cwd(), {
			artifactStore: store,
			toolOutputs: { maxFetchChars: 500 },
			operations: { fetch: async () => response(body) },
		});

		const result = await tool.execute(
			"fetch-render",
			{ url: "https://example.com" },
			undefined,
			undefined,
			{} as any,
		);
		const component = tool.renderResult(result as any, { expanded: true, isPartial: false }, theme, {
			showImages: false,
			lastComponent: undefined,
		} as any);
		const rendered = renderText(component);
		const notice = "Full fetch content saved to artifact file";

		expect(rendered.match(new RegExp(notice, "g"))?.length ?? 0).toBe(1);
	});

	it("uses content-type-specific extensions for fetch artifacts", async () => {
		const store = new ArtifactStore("session-f", agentDir);
		const htmlTool = createFetchToolDefinition(process.cwd(), {
			artifactStore: store,
			toolOutputs: { maxFetchChars: 500 },
			operations: { fetch: async () => response(`<html><body>${"x".repeat(1200)}</body></html>`, "text/html") },
		});
		const jsonTool = createFetchToolDefinition(process.cwd(), {
			artifactStore: store,
			toolOutputs: { maxFetchChars: 500 },
			operations: { fetch: async () => response(JSON.stringify({ data: "x".repeat(1200) }), "application/json") },
		});

		const htmlResult = await htmlTool.execute(
			"fetch-html",
			{ url: "https://example.com" },
			undefined,
			undefined,
			{} as any,
		);
		const jsonResult = await jsonTool.execute(
			"fetch-json",
			{ url: "https://example.com/data" },
			undefined,
			undefined,
			{} as any,
		);
		expect(htmlResult.details?.fetchArtifactPath).toMatch(/\.html$/);
		expect(jsonResult.details?.fetchArtifactPath).toMatch(/\.json$/);
	});

	it("matches the runtime default fetch truncation limit of 40000 chars", async () => {
		const store = new ArtifactStore("session-f", agentDir);
		const tool = createFetchToolDefinition(process.cwd(), {
			artifactStore: store,
			operations: { fetch: async () => response("x".repeat(30_000)) },
		});

		const result = await tool.execute(
			"default-limit",
			{ url: "https://example.com" },
			undefined,
			undefined,
			{} as any,
		);
		expect(result.details?.truncated).toBe(false);
		expect(result.details?.fetchArtifactPath).toBeUndefined();
	});

	it("does not create artifacts for short fetched content", async () => {
		const store = new ArtifactStore("session-f", agentDir);
		const tool = createFetchToolDefinition(process.cwd(), {
			artifactStore: store,
			toolOutputs: { maxFetchChars: 500 },
			operations: { fetch: async () => response("short") },
		});

		const result = await tool.execute("short", { url: "https://example.com" }, undefined, undefined, {} as any);
		expect(result.details?.fetchArtifactPath).toBeUndefined();
		expect(text(result)).not.toContain("Full fetch content saved");
	});
});
