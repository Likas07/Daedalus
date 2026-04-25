<script lang="ts">
	import type { AppEvent, AuditEntry, AutomationRule, ExtensionUiField, ExtensionUiRequest } from "@daedalus-pi/app-server-protocol";
	import { orchestrationFromEvents } from "../client/orchestration-state";
	import type { GuiState } from "../client/runtime";
	import type { RendererSafeExtensionMetadata } from "../client/extension-surfaces";
	import ApprovalQueue from "./ApprovalQueue.svelte";
	import AuditTrailPanel from "./AuditTrailPanel.svelte";
	import AutomationRulesPanel from "./AutomationRulesPanel.svelte";
	import ExtensionsManager from "./ExtensionsManager.svelte";
	import OrchestrationPanel from "./OrchestrationPanel.svelte";
	const { state: uiState, respondToApproval } = $props<{
		state: GuiState;
		respondToApproval: (approvalId: string, decision: "approved" | "denied") => void;
	}>();
	let tab: "overview" | "orchestration" | "audit" | "automation" | "extensions" | "debug" = $state("overview");
	const panel = "rounded-lg border border-zinc-800 bg-zinc-900/45 p-3";
	const heading = "mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400";
	const card = "mb-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-2 text-xs text-zinc-400";
	const empty = "text-xs text-zinc-500";
	const orchestration = $derived(orchestrationFromEvents(uiState.events));
	const auditEntries = $derived(uiState.events.slice(-80).reverse().map((event: AppEvent): AuditEntry => ({ 
		id: event.id,
		ts: event.ts,
		kind: event.type.includes("tool") ? "tool" : event.type.includes("approval") ? "approval" : event.type.includes("extension") ? "extension" : "transcript",
		title: event.type,
		summary: typeof event.payload === "object" && event.payload && "summary" in event.payload ? String(event.payload.summary) : event.type,
		sessionId: event.sessionId,
		metadata: { eventType: event.type },
	})));
	const automationRules: AutomationRule[] = [
		{ id: "background-agent-management", kind: "background-agent", title: "Background agent management", description: "Surface stalled or blocked subagents for review.", enabled: true, requiresConfirmation: false },
		{ id: "post-run-review-prompts", kind: "post-run-review", title: "Post-run review prompts", description: "Suggest review checkpoints after agent completion.", enabled: true, requiresConfirmation: false },
		{ id: "test-status-reminders", kind: "test-status", title: "Test status reminders", description: "Remind when tests have not been run after edits.", enabled: true, requiresConfirmation: false },
		{ id: "cleanup-suggestions", kind: "cleanup", title: "Cleanup suggestions", description: "Suggest destructive cleanup only after explicit confirmation.", enabled: true, requiresConfirmation: true, destructive: true },
	];
	const extensions = $derived(uiState.extensionRequests.map((request: ExtensionUiRequest): RendererSafeExtensionMetadata => ({
		id: request.extensionId,
		enabled: true,
		capabilities: ["ui"],
		permissions: [],
		commands: request.actions.map((action: { id: string; label: string }) => ({ id: `${request.extensionId}:${action.id}`, extensionId: request.extensionId, kind: "command", title: action.label })),
		panes: request.fields.map((field: ExtensionUiField) => ({ id: `${request.extensionId}:${field.id}`, extensionId: request.extensionId, kind: "pane", title: field.label })),
		backgroundTasks: [],
		errors: [],
	})));
</script>

<aside class="min-h-0 overflow-auto border-l border-zinc-800 bg-zinc-950/80">
	<div class="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 p-3">
		<h2 class="text-sm font-medium">Inspector</h2>
		<p class="text-[10px] text-zinc-500">Approvals · diff · extensions · integrations</p>
		<div class="mt-3 grid grid-cols-3 gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1 text-xs">
			<button type="button" class={`rounded-md px-2 py-1 ${tab === 'overview' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'}`} onclick={() => (tab = "overview")}>Overview <span class="text-amber-300">{uiState.approvalItems.length}</span></button>
			<button type="button" class={`rounded-md px-2 py-1 ${tab === 'orchestration' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'}`} onclick={() => (tab = "orchestration")}>Orchestration</button>
			<button type="button" class={`rounded-md px-2 py-1 ${tab === 'audit' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'}`} onclick={() => (tab = "audit")}>Audit</button>
			<button type="button" class={`rounded-md px-2 py-1 ${tab === 'automation' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'}`} onclick={() => (tab = "automation")}>Automation</button>
			<button type="button" class={`rounded-md px-2 py-1 ${tab === 'extensions' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'}`} onclick={() => (tab = "extensions")}>Extensions</button>
			<button type="button" class={`rounded-md px-2 py-1 ${tab === 'debug' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'}`} onclick={() => (tab = "debug")} data-testid="inspector-debug-tab">Debug</button>
		</div>
	</div>
	<div class="space-y-3 p-3">
		{#if tab === "overview"}
			<section class={panel}><ApprovalQueue approvals={uiState.approvalItems} respond={(approval, decision) => respondToApproval(approval.id, decision)} /></section>
			<section class={panel}><h3 class={heading}>Diff review</h3><div class="rounded-md border border-zinc-800 bg-black/30 p-2 font-mono text-[11px] text-zinc-500">Awaiting file change events…</div></section>
			<section class={panel}><h3 class={heading}>Extensions</h3>{#each uiState.extensionRequests as request}<div class={card}><p class="font-medium">{request.extensionId}</p><p>{request.actions.length} actions · {request.fields.length} fields</p></div>{:else}<p class={empty}>Extension surface idle.</p>{/each}</section>
			<section class={panel}><h3 class={heading}>Integrations</h3>{#each uiState.integrations as integration}<div class={card}><div class="flex justify-between"><span class="font-medium">{integration.provider}</span><span class="text-cyan-300">{integration.status}</span></div><p>{integration.repository ? `${integration.repository.owner}/${integration.repository.name}` : 'No repository'}</p><p>{integration.issues.length} issues · {integration.pullRequests.length} PRs · {integration.ciChecks.length} checks</p></div>{:else}<p class={empty}>GitHub, Linear, CI, and extensions appear here.</p>{/each}</section>
		{:else if tab === "orchestration"}
			<section class={panel}><OrchestrationPanel projection={orchestration} /></section>
		{:else if tab === "audit"}
			<section class={panel}><AuditTrailPanel entries={auditEntries} /></section>
		{:else if tab === "automation"}
			<section class={panel}><AutomationRulesPanel rules={automationRules} /></section>
		{:else if tab === "extensions"}
			<section class={panel}><ExtensionsManager {extensions} /></section>
		{:else}
			<section class={panel} data-testid="debug-inspector">
				<h3 class={heading}>Raw event JSON</h3>
				{#each uiState.events.slice(-40).reverse() as event}
					<details class="mb-2 rounded-md border border-zinc-800 bg-black/30 p-2 text-xs text-zinc-400">
						<summary class="cursor-pointer text-zinc-200">{event.type} <span class="text-zinc-600">{event.sessionId ?? "system"}</span></summary>
						<pre class="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-[11px]">{JSON.stringify(event, null, 2)}</pre>
					</details>
				{:else}<p class={empty}>No raw events captured.</p>{/each}
			</section>
		{/if}
	</div>
</aside>
