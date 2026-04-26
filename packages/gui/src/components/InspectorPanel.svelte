<script lang="ts">
	import type {
		AppEvent,
		AuditEntry,
		AutomationRule,
		ExtensionUiField,
		ExtensionUiRequest,
	} from "@daedalus-pi/app-server-protocol";
	import { orchestrationFromEvents } from "../client/orchestration-state";
	import { workflowFromTypedEvents } from "../client/daedalus-workflow-view-model";
	import type { GuiState } from "../client/runtime";
	import type { RendererSafeExtensionMetadata } from "../client/extension-surfaces";
	import ApprovalQueue from "./ApprovalQueue.svelte";
	import AuditTrailPanel from "./AuditTrailPanel.svelte";
	import AutomationRulesPanel from "./AutomationRulesPanel.svelte";
	import ExtensionsManager from "./ExtensionsManager.svelte";
	import OrchestrationPanel from "./OrchestrationPanel.svelte";

	const { guiState: uiState, respondToApproval } = $props<{
		guiState: GuiState;
		respondToApproval: (approvalId: string, decision: "approved" | "denied") => void;
	}>();

	type Tab = "overview" | "orchestration" | "audit" | "automation" | "extensions" | "debug";
	let tab = $state<Tab>("overview");

	const tabs: Array<{ id: Tab; label: string; testid?: string; tone?: "ember" }> = [
		{ id: "overview", label: "Overview" },
		{ id: "orchestration", label: "Orchestration" },
		{ id: "audit", label: "Audit" },
		{ id: "automation", label: "Automation" },
		{ id: "extensions", label: "Extensions" },
		{ id: "debug", label: "Debug", testid: "inspector-debug-tab" },
	];

	const orchestration = $derived(orchestrationFromEvents(uiState.events));
	const daedalusWorkflow = $derived(workflowFromTypedEvents(uiState.events));
	const auditEntries = $derived(
		uiState.events.slice(-80).reverse().map((event: AppEvent): AuditEntry => ({
			id: event.id,
			ts: event.ts,
			kind: event.type.includes("tool")
				? "tool"
				: event.type.includes("approval")
					? "approval"
					: event.type.includes("extension")
						? "extension"
						: "transcript",
			title: event.type,
			summary:
				typeof event.payload === "object" && event.payload && "summary" in event.payload
					? String(event.payload.summary)
					: event.type,
			sessionId: event.sessionId,
			metadata: { eventType: event.type },
		})),
	);

	const automationRules: AutomationRule[] = [
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

	const extensions = $derived(
		uiState.extensionRequests.map((request: ExtensionUiRequest): RendererSafeExtensionMetadata => ({
			id: request.extensionId,
			enabled: true,
			capabilities: ["ui"],
			permissions: [],
			commands: request.actions.map((action: { id: string; label: string }) => ({
				id: `${request.extensionId}:${action.id}`,
				extensionId: request.extensionId,
				kind: "command",
				title: action.label,
			})),
			panes: request.fields.map((field: ExtensionUiField) => ({
				id: `${request.extensionId}:${field.id}`,
				extensionId: request.extensionId,
				kind: "pane",
				title: field.label,
			})),
			backgroundTasks: [],
			errors: [],
		})),
	);
</script>

<aside class="flex h-full min-h-0 flex-col border-l border-[color:var(--rule)] bg-[color:var(--ink-0)]">
	<header class="sticky top-0 z-10 border-b border-[color:var(--rule)] bg-[color:var(--ink-1)]/95 px-4 pt-4 pb-3 backdrop-blur">
		<div class="flex items-baseline justify-between gap-3">
			<div>
				<div class="eyebrow eyebrow-brass">drawer · 02 · inspector</div>
				<h2 class="mt-1 font-display text-[20px] italic text-[color:var(--bone)]">Inspector</h2>
			</div>
			<span class="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--bone-faint)]">
				facets · 06
			</span>
		</div>
		<p class="mt-1 font-mono text-[10.5px] text-[color:var(--bone-faint)]">
			approvals · diff · audit · automation · extensions · debug
		</p>
		<div class="mt-3 inspector-tab-bar">
			{#each tabs as tabItem}
				<button
					type="button"
					class="inspector-tab"
					data-active={tab === tabItem.id}
					data-testid={tabItem.testid}
					onclick={() => (tab = tabItem.id)}
				>
					{tabItem.label}
					{#if tabItem.id === "overview" && uiState.approvalItems.length > 0}
						<span class="ml-1 inline-flex size-4 items-center justify-center rounded-full bg-[color:var(--ember)] text-[9px] font-semibold text-[color:var(--ink-0)] tnum">
							{uiState.approvalItems.length}
						</span>
					{/if}
				</button>
			{/each}
		</div>
	</header>

	<div class="min-h-0 flex-1 space-y-3 overflow-auto p-4">
		{#if tab === "overview"}
			<section class="inspector-section">
				<ApprovalQueue
					approvals={uiState.approvalItems}
					respond={(approval, decision) => respondToApproval(approval.id, decision)}
				/>
			</section>
			<section class="inspector-section">
				<h3 class="inspector-heading">Diff review</h3>
				<div class="rounded-md border border-dashed border-[color:var(--rule)] bg-[color:var(--ink-3)] p-3 font-mono text-[11px] text-[color:var(--bone-faint)]">
					Awaiting file change events…
				</div>
			</section>
			<section class="inspector-section">
				<h3 class="inspector-heading">Extensions</h3>
				{#each uiState.extensionRequests as request}
					<div class="inspector-card">
						<p class="inspector-card-title">
							<span>{request.extensionId}</span>
							<span class="font-mono text-[10.5px] text-[color:var(--bone-faint)]">ext</span>
						</p>
						<p class="inspector-card-meta">
							{request.actions.length} actions · {request.fields.length} fields
						</p>
					</div>
				{:else}
					<p class="inspector-empty">Extension surface idle.</p>
				{/each}
			</section>
			<section class="inspector-section">
				<h3 class="inspector-heading">Integrations</h3>
				{#each uiState.integrations as integration}
					<div class="inspector-card">
						<p class="inspector-card-title">
							<span>{integration.provider}</span>
							<span class="pill pill-blue">{integration.status}</span>
						</p>
						<p class="inspector-card-meta">
							{integration.repository
								? `${integration.repository.owner}/${integration.repository.name}`
								: "No repository"}
						</p>
						<p class="inspector-card-meta">
							{integration.issues.length} issues · {integration.pullRequests.length} PRs · {integration.ciChecks.length} checks
						</p>
					</div>
				{:else}
					<p class="inspector-empty">GitHub, Linear, CI, and extensions appear here.</p>
				{/each}
			</section>
		{:else if tab === "orchestration"}
			<section class="inspector-section">
				<OrchestrationPanel projection={daedalusWorkflow?.orchestration ?? orchestration} workflow={daedalusWorkflow} />
			</section>
		{:else if tab === "audit"}
			<section class="inspector-section">
				<AuditTrailPanel entries={auditEntries} />
			</section>
		{:else if tab === "automation"}
			<section class="inspector-section">
				<AutomationRulesPanel rules={automationRules} />
			</section>
		{:else if tab === "extensions"}
			<section class="inspector-section">
				<ExtensionsManager {extensions} />
			</section>
		{:else}
			<section class="inspector-section" data-testid="debug-inspector">
				<h3 class="inspector-heading">Raw event JSON</h3>
				{#each uiState.events.slice(-40).reverse() as event}
					<details class="mb-2 rounded-md border border-[color:var(--rule)] bg-[color:var(--ink-3)] p-2">
						<summary class="cursor-pointer font-mono text-[11px] text-[color:var(--bone)]">
							<span>{event.type}</span>
							<span class="ml-2 text-[color:var(--bone-faint)]">{event.sessionId ?? "system"}</span>
						</summary>
						<pre class="transcript-pre">{JSON.stringify(event, null, 2)}</pre>
					</details>
				{:else}
					<p class="inspector-empty">No raw events captured.</p>
				{/each}
			</section>
		{/if}
	</div>
</aside>
