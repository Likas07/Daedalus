import type { AutomationProjection, AutomationRule } from "@daedalus-pi/app-server-protocol";

export class AutomationService {
	private readonly rules = new Map<string, AutomationRule>(defaultAutomationRules().map((rule) => [rule.id, rule]));
	readProjection(): AutomationProjection {
		return { rules: [...this.rules.values()], suggestions: [], updatedAt: new Date().toISOString() };
	}
	setEnabled(id: string, enabled: boolean): AutomationRule {
		const rule = this.rules.get(id);
		if (!rule) throw new Error(`Unknown automation rule: ${id}`);
		const next = { ...rule, enabled };
		this.rules.set(id, next);
		return next;
	}
}
export function defaultAutomationRules(): AutomationRule[] {
	return [
		{
			id: "background-agent-management",
			kind: "background-agent",
			title: "Background agent management",
			description: "Surface stalled or blocked subagents for review.",
			enabled: true,
			requiresConfirmation: false,
		},
		{
			id: "post-run-review-prompts",
			kind: "post-run-review",
			title: "Post-run review prompts",
			description: "Suggest review checkpoints after agent completion.",
			enabled: true,
			requiresConfirmation: false,
		},
		{
			id: "test-status-reminders",
			kind: "test-status",
			title: "Test status reminders",
			description: "Remind when tests have not been run after edits.",
			enabled: true,
			requiresConfirmation: false,
		},
		{
			id: "cleanup-suggestions",
			kind: "cleanup",
			title: "Cleanup suggestions",
			description: "Suggest destructive cleanup only after explicit confirmation.",
			enabled: true,
			requiresConfirmation: true,
			destructive: true,
		},
	];
}
