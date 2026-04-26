import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { AppEvent } from "@daedalus-pi/app-server-protocol";
import { projectAuditTrail } from "../../app-server/src/runtime/audit-projection";
import { defaultAutomationRules } from "../../app-server/src/runtime/automation-service";
import { projectOrchestration } from "../../app-server/src/runtime/orchestration-projection";
import type { RendererSafeExtensionMetadata } from "./client/extension-surfaces";
import { extensionCommands } from "./client/extension-surfaces";
import { orchestrationFromEvents } from "./client/orchestration-state";

describe("phase 4 differentiation projections", () => {
	test("projects orchestration lanes without internal prompt leakage", () => {
		const events: AppEvent[] = [
			{
				id: "e1",
				type: "agent/subagent_started",
				ts: "2026-04-24T00:00:00.000Z",
				sessionId: "s1",
				payload: { taskId: "t1", title: "Worker", summary: "done <internal>secret prompt</internal>" },
			},
		];
		const projection = projectOrchestration(events, new Date("2026-04-24T00:00:01.000Z"));
		expect(projection.lanes[0]?.title).toBe("Worker");
		expect(projection.lanes[0]?.summary).not.toContain("secret prompt");
	});

	test("builds queryable audit entries", () => {
		const events: AppEvent[] = [
			{
				id: "e2",
				type: "tool/file_edit",
				ts: "2026-04-24T00:00:00.000Z",
				sessionId: "s1",
				payload: { title: "Edit", path: "src/a.ts", summary: "changed" },
			},
		];
		const audit = projectAuditTrail(events, { kinds: ["tool"], text: "edit" });
		expect(audit.entries).toHaveLength(1);
		expect(audit.entries[0]?.target).toBe("src/a.ts");
	});

	test("exposes automation rules requiring destructive confirmation", () => {
		const cleanup = defaultAutomationRules().find((rule) => rule.kind === "cleanup");
		expect(cleanup?.requiresConfirmation).toBe(true);
		expect(cleanup?.destructive).toBe(true);
	});

	test("derives renderer orchestration and extension command surfaces", () => {
		const projection = orchestrationFromEvents([
			{ id: "e3", type: "approval/requested", ts: "now", sessionId: "s1", payload: {} },
		]);
		expect(projection.lanes[0]?.status).toBe("blocked");
		const extensions = [
			{
				id: "ext",
				enabled: true,
				capabilities: [],
				permissions: [],
				commands: [{ id: "cmd", extensionId: "ext", kind: "command", title: "Run" }],
				panes: [],
				backgroundTasks: [],
				errors: [],
			},
		] satisfies RendererSafeExtensionMetadata[];
		expect(extensionCommands(extensions)[0]?.title).toBe("Run");
	});

	test("phase 4 panels are wired into live GUI surfaces", () => {
		const inspector = readFileSync(new URL("./components/InspectorPanel.svelte", import.meta.url), "utf8");
		const workspace = readFileSync(new URL("./components/SessionWorkspace.svelte", import.meta.url), "utf8");
		const settings = readFileSync(new URL("./components/SettingsPanel.svelte", import.meta.url), "utf8");
		const palette = readFileSync(new URL("./components/CommandPalette.svelte", import.meta.url), "utf8");
		const diffViewer = readFileSync(new URL("./components/DiffViewer.svelte", import.meta.url), "utf8");
		const inspectorMock = readFileSync(new URL("./components/Inspector.svelte", import.meta.url), "utf8");

		expect(inspector).toContain("OrchestrationPanel");
		expect(inspector).toContain("AuditTrailPanel");
		expect(inspector).toContain("AutomationRulesPanel");
		expect(inspector).toContain("ExtensionsManager");
		expect(workspace).toContain("PlanBuildModePanel");
		expect(settings).toContain("AutomationRulesPanel");
		expect(settings).toContain("ExtensionsManager");
		expect(palette).toContain("extensionCommands(extensions)");
		expect(inspectorMock).toContain("guiState.activeDiff?.files");
		expect(diffViewer).toContain("@pierre/diffs/ssr");
		expect(diffViewer).toContain("preloadPatchDiff");
		expect(diffViewer).toContain("Requires Git mutation policy");
		expect(diffViewer).toContain("Requires destructive-action policy");
		expect(diffViewer).toContain("Requires commit/push policy");
	});
});
