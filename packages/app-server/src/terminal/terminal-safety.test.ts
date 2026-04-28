import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertPathWithinRoot } from "../workspaces/root-boundary";
import { TerminalSafetyService } from "./terminal-safety";

describe("TerminalSafetyService", () => {
	test("normalizes unsafe shells to the configured default", () => {
		const safety = new TerminalSafetyService({ defaultShell: "/bin/sh", allowedShells: ["/bin/sh", "/bin/bash"] });
		expect(safety.normalizeShell("/bin/bash")).toBe("/bin/bash");
		expect(safety.normalizeShell("bash -i")).toBe("/bin/sh");
		expect(safety.normalizeShell("/tmp/evil")).toBe("/bin/sh");
	});

	test("validates cwd against a root boundary target", async () => {
		const root = await mkdtemp(join(tmpdir(), "daedalus-terminal-safety-root-"));
		const outside = await mkdtemp(join(tmpdir(), "daedalus-terminal-safety-outside-"));
		const target = await assertPathWithinRoot({ root, candidate: root, purpose: "terminal" });
		const safety = new TerminalSafetyService({ defaultShell: "/bin/sh", allowedShells: ["/bin/sh"] });
		expect(await safety.validateCreate({ cwd: root, shell: "/bin/sh", guardTarget: target })).toMatchObject({
			cwd: target.canonicalRootPath,
			guardStatus: "valid",
		});
		const violated = await safety.validateCreate({ cwd: outside, shell: "/bin/sh", guardTarget: target });
		expect(violated.guardStatus).toBe("violated");
		expect(violated.rejectedReason).toBe("target-outside-root");
	});

	test("rejects invalid owners, missing required guard, and oversize input", async () => {
		const safety = new TerminalSafetyService({
			maxInputBytes: 4,
			defaultShell: "/bin/sh",
			allowedShells: ["/bin/sh"],
		});
		expect((await safety.validateCreate({ cwd: "/tmp", owner: "bad\nowner" })).rejectedReason).toBe(
			"invalid-terminal-owner",
		);
		expect((await safety.validateCreate({ cwd: "/tmp", requireRootBoundary: true })).rejectedReason).toBe(
			"missing-root-boundary",
		);
		expect(safety.validateInput("1234")).toEqual({ ok: true });
		expect(safety.validateInput("12345")).toEqual({ ok: false, rejectedReason: "terminal-input-too-large" });
	});
});
