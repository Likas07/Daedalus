import { describe, expect, it } from "bun:test";
import type { TaskIsolationMode } from "../../src/task/isolation-backend";
import { resolveTaskIsolationRequest } from "../../src/task/isolation-policy";

describe("task isolation policy", () => {
	it("defaults to no isolation when config and profile do not request it", () => {
		expect(resolveTaskIsolationRequest("none", undefined, undefined)).toEqual({
			isolationRequested: false,
			effectiveIsolationMode: "none",
		});
	});

	it("uses worktree when task isolation is explicitly requested under a none default", () => {
		expect(resolveTaskIsolationRequest("none", true, undefined)).toEqual({
			isolationRequested: true,
			effectiveIsolationMode: "worktree",
		});
	});

	it("uses worktree when the agent profile opts into isolation under a none default", () => {
		expect(resolveTaskIsolationRequest("none", undefined, true)).toEqual({
			isolationRequested: true,
			effectiveIsolationMode: "worktree",
		});
	});

	it("lets an explicit task flag disable a profile-level isolation default", () => {
		expect(resolveTaskIsolationRequest("worktree", false, true)).toEqual({
			isolationRequested: false,
			effectiveIsolationMode: "worktree",
		});
	});

	it("preserves the configured backend when isolation is requested", () => {
		for (const mode of ["worktree", "fuse-overlay", "fuse-projfs"] as TaskIsolationMode[]) {
			expect(resolveTaskIsolationRequest(mode, undefined, true)).toEqual({
				isolationRequested: true,
				effectiveIsolationMode: mode,
			});
		}
	});
});
