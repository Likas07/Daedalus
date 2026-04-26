import { describe, expect, test } from "bun:test";
import { getGuiCapability, strictGuiParityViolations, type GuiCapability } from "./client/capability-registry";
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
			{
				id: "e3",
				type: "orchestration/projected",
				ts: "now",
				sessionId: "s1",
				payload: {
					projection: {
						mode: "build",
						lanes: [
							{
								id: "lane-1",
								sessionId: "s1",
								kind: "worker",
								title: "Waiting for approval",
								status: "blocked",
								dependencies: [],
								blockedBy: ["approval-1"],
								artifacts: [{ kind: "approval", id: "approval-1", label: "Approval" }],
							},
						],
						checkpoints: [],
						updatedAt: "now",
					},
				},
			},
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

	test("workflow and inspector surfaces are guarded by behavioral full-parity coverage", () => {
		const workflowInspector = getGuiCapability("workflow-inspector");
		expect(workflowInspector.requirement).toBe("required");
		expect(workflowInspector.coverage?.behavioral).toContain(
			"packages/app-server/src/runtime/daedalus-workflow-service.test.ts",
		);
		expect(workflowInspector.coverage?.behavioral).toContain(
			"packages/gui/src/client/daedalus-workflow-view-model.test.ts",
		);
		expect(workflowInspector.coverage?.behavioral).toContain("packages/gui/src/phase4-differentiation.test.ts");

		const wiredWorkflowInspector: GuiCapability = {
			...workflowInspector,
			status: "wired",
			disabledReason: undefined,
		};
		expect(
			strictGuiParityViolations([wiredWorkflowInspector]).filter(
				(violation) => violation.capabilityId === "workflow-inspector",
			),
		).toEqual([]);

		const sourceOnlyWorkflowInspector: GuiCapability = {
			...wiredWorkflowInspector,
			coverage: { behavioral: ["packages/gui/src/components/InspectorPanel.svelte"] },
		};
		expect(strictGuiParityViolations([sourceOnlyWorkflowInspector])).toContainEqual(
			expect.objectContaining({
				capabilityId: "workflow-inspector",
				kind: "non-behavioral-coverage",
			}),
		);
	});
});
