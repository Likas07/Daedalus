import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArtifactStore } from "../../src/core/tools/artifact-store.js";

const tmpRoot = join(tmpdir(), "daedalus-artifact-store-test");

describe("ArtifactStore", () => {
	let agentDir: string;

	beforeEach(() => {
		agentDir = join(tmpRoot, `${Date.now()}-${Math.random().toString(16).slice(2)}`);
	});

	afterEach(() => {
		rmSync(agentDir, { recursive: true, force: true });
	});

	it("creates the per-session artifact directory on first write", () => {
		const store = new ArtifactStore("session/one", agentDir);
		const path = store.writeArtifact("stdout", "tool:1", "hello");
		expect(path).toBe(join(agentDir, "artifacts", "session-one", "tool-1-stdout.txt"));
		expect(existsSync(path)).toBe(true);
		expect(readFileSync(path, "utf8")).toBe("hello");
	});

	it("supports content-type-specific artifact extensions", () => {
		const store = new ArtifactStore("session/one", agentDir);
		const path = store.writeArtifact("fetch", "tool:1", "{}", { extension: ".json" });
		expect(path).toBe(join(agentDir, "artifacts", "session-one", "tool-1-fetch.json"));
	});

	it("uses safe deterministic filenames", () => {
		const store = new ArtifactStore("../session", agentDir);
		const path = store.writeArtifact("fetch", "../tool call", "body");
		expect(path).toBe(join(agentDir, "artifacts", "session", "tool-call-fetch.txt"));
		expect(path).not.toContain("..");
	});

	it("returns a sanitized visible artifact path", () => {
		const store = new ArtifactStore("session", agentDir);
		const artifactPath = store.writeArtifact("stdout", "tool", "body");
		expect(store.getVisiblePath(artifactPath, agentDir)).toBe("artifacts/session/tool-stdout.txt");
	});

	it("does not overwrite an existing artifact for the same tool call", () => {
		const store = new ArtifactStore("s", agentDir);
		const first = store.writeArtifact("stderr", "tc", "first");
		const second = store.writeArtifact("stderr", "tc", "second");
		expect(first).toBe(join(agentDir, "artifacts", "s", "tc-stderr.txt"));
		expect(second).toBe(join(agentDir, "artifacts", "s", "tc-stderr-2.txt"));
		expect(readFileSync(first, "utf8")).toBe("first");
		expect(readFileSync(second, "utf8")).toBe("second");
	});
});
