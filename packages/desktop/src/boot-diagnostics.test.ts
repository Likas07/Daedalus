import { describe, expect, test } from "bun:test";
import {
	appendExcerpt,
	attachBootDiagnostics,
	createBootDiagnostics,
	finalizeBootDiagnostics,
	recordBootStage,
	redactCommand,
	redactPath,
} from "./boot-diagnostics";

describe("boot diagnostics", () => {
	test("redacts token paths in commands", () => {
		const tokenFile = "/tmp/daedalus/app-server.token";
		expect(redactPath(tokenFile)).toBe("/tmp/daedalus/<redacted>");
		expect(redactCommand("bun", ["server.ts", "--token-file", tokenFile], [tokenFile])).toEqual([
			"bun",
			"server.ts",
			"--token-file",
			"/tmp/daedalus/<redacted>",
		]);
	});

	test("records readiness stages and final status", () => {
		const diagnostics = createBootDiagnostics();
		recordBootStage(diagnostics, "manifest-reuse", "failed", "stale manifest");
		recordBootStage(diagnostics, "readiness-json", "ok", "ready");
		const finalized = finalizeBootDiagnostics(diagnostics, { ready: true, durationMs: 12 });
		expect(finalized.ready).toBe(true);
		expect(finalized.stage).toBe("ready");
		expect(finalized.stages.map((stage) => stage.name)).toEqual(["manifest-reuse", "readiness-json"]);
	});

	test("keeps bounded stdout/stderr excerpts and attaches errors", () => {
		expect(appendExcerpt("abc", "def", 4)).toBe("cdef");
		const diagnostics = finalizeBootDiagnostics(createBootDiagnostics(), { ready: false, error: "boom" });
		const error = attachBootDiagnostics(new Error("boom"), diagnostics);
		expect(error.bootDiagnostics.error).toBe("boom");
	});
});
