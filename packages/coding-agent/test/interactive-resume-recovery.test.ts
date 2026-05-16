import { describe, expect, it } from "vitest";
import type { WorkspaceResumeSafetyDiagnostic } from "../src/core/session-cwd.js";
import { getInteractiveResumeRecoveryAction } from "../src/modes/interactive/resume-recovery.js";

function branchMismatchDiagnostic(): WorkspaceResumeSafetyDiagnostic {
	return {
		ok: false,
		sessionFile: "/tmp/session.jsonl",
		sessionCwd: "/repo",
		fallbackCwd: "/repo",
		workspaceIdentity: {
			version: 1,
			workspace: {
				cwd: "/repo",
				projectRoot: "/repo",
				isolationMode: "shared",
				branch: "agent/expected",
				validationStatus: "valid",
			},
		},
		issues: [
			{
				code: "branch_mismatch",
				status: "invalid",
				message: "Current branch does not match session workspace branch",
				expectedCwd: "/repo",
				actualCwd: "/repo",
				workspace: {
					cwd: "/repo",
					projectRoot: "/repo",
					isolationMode: "shared",
					branch: "agent/expected",
					validationStatus: "valid",
				},
				sessionFile: "/tmp/session.jsonl",
				recovery: "switch_branch",
			},
		],
	};
}

describe("interactive resume recovery", () => {
	it("offers recovery choices when resume is blocked only by a branch mismatch", () => {
		expect(getInteractiveResumeRecoveryAction(branchMismatchDiagnostic())).toEqual({
			kind: "branch_mismatch_recovery",
			reason: "branch_mismatch",
			message: "Current branch does not match the session branch. Choose how to continue.",
			choices: ["switch_original_workspace", "fork_current_workspace", "cancel"],
		});
	});

	it("does not offer recovery choices when branch mismatch is combined with another issue", () => {
		const diagnostic = branchMismatchDiagnostic();
		diagnostic.issues.push({
			code: "missing_cwd",
			status: "workspace_missing",
			message: "Stored session working directory does not exist",
			expectedCwd: "/repo",
			actualCwd: "/fallback",
			sessionFile: "/tmp/session.jsonl",
			recovery: "choose_cwd",
		});

		expect(getInteractiveResumeRecoveryAction(diagnostic)).toBeUndefined();
	});

	it("does not offer recovery choices for non-branch mismatches", () => {
		const diagnostic = branchMismatchDiagnostic();
		diagnostic.issues[0] = {
			code: "project_mismatch",
			status: "invalid",
			message: "Session workspace belongs to a different project",
			expectedCwd: "/repo",
			actualCwd: "/other-repo",
			sessionFile: "/tmp/session.jsonl",
			recovery: "open_project",
		};

		expect(getInteractiveResumeRecoveryAction(diagnostic)).toBeUndefined();
	});
});
