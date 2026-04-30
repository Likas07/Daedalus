<script lang="ts">
	import type { ProjectionThreadStore } from "../../client/projection-runtime";
	import SafetySignalStrip from "./SafetySignalStrip.svelte";

	type Section = "safety" | "worktree" | "diff" | "approvals" | "workflow" | "diagnostics";
	const { thread, targetValidation = "valid", accessMode = "ask", dirtyTarget = false, connectionState = "connected" } = $props<{
		thread?: ProjectionThreadStore;
		targetValidation?: string;
		accessMode?: string;
		dirtyTarget?: boolean;
		connectionState?: string;
	}>();
	let open = $state<Record<Section, boolean>>({ safety: true, worktree: true, diff: true, approvals: true, workflow: false, diagnostics: false });
	const pendingApprovals = $derived(thread?.pendingActions.filter((action: import("@daedalus-pi/app-server-protocol").ThreadPendingAction) => action.kind === "approval") ?? []);
	const workflowActivity = $derived(thread?.activity.filter((item: import("@daedalus-pi/app-server-protocol").ThreadActivity) => item.kind !== "approval" && item.kind !== "diff") ?? []);
	function toggle(section: Section): void { open[section] = !open[section]; }
</script>

{#snippet header(section: Section, label: string, count = "")}
	<button type="button" onclick={() => toggle(section)} aria-expanded={open[section]} class="group flex w-full items-center justify-between py-3 text-left transition hover:text-bone-50">
		<span class="caps text-bone-300 group-hover:text-bone-100">{label}</span><span class="font-mono text-[10px] text-bone-400">{count}</span>
	</button>
{/snippet}

<aside class="flex h-full min-h-0 flex-col overflow-y-auto px-5 text-[12.5px]" aria-label="Thread inspector" data-testid="thread-inspector">
	<section class="border-b border-ink-500">{@render header("safety", "safety", `${thread?.safetySignals.length ?? 0}`)}{#if open.safety}<div class="space-y-2 pb-4"><SafetySignalStrip {targetValidation} {accessMode} {dirtyTarget} pendingApprovals={pendingApprovals.length} {connectionState} signals={thread?.safetySignals ?? []} />{#each thread?.safetySignals ?? [] as signal}<div class="rounded-sm border border-ink-500 p-2"><div class="caps text-bone-300">{signal.level} {signal.code ?? ""}</div><p class="mt-1 text-bone-100">{signal.message}</p></div>{/each}</div>{/if}</section>
	<section class="border-b border-ink-500">{@render header("worktree", "worktree", thread?.worktreeId ? "1" : "0")}{#if open.worktree}<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pb-4 font-mono text-[10.5px]"><dt class="text-bone-400">thread</dt><dd class="truncate text-bone-100">{thread?.threadId ?? "none"}</dd><dt class="text-bone-400">session</dt><dd class="truncate text-bone-100">{thread?.sessionId ?? "none"}</dd><dt class="text-bone-400">project</dt><dd class="truncate text-bone-100">{thread?.projectId ?? "none"}</dd><dt class="text-bone-400">worktree</dt><dd class="truncate text-bone-100">{thread?.worktreeId ?? "base"}</dd></dl>{/if}</section>
	<section class="border-b border-ink-500">{@render header("diff", "diff", `${thread?.diffIds.length ?? 0}`)}{#if open.diff}<ul class="space-y-1 pb-4">{#each thread?.diffIds ?? [] as diffId}<li class="font-mono text-[10.5px] text-bone-100">{diffId}</li>{:else}<li class="text-bone-400">No projected diffs.</li>{/each}</ul>{/if}</section>
	<section class="border-b border-ink-500">{@render header("approvals", "approvals", `${pendingApprovals.length}`)}{#if open.approvals}<ul class="space-y-2 pb-4">{#each pendingApprovals as action}<li class="rounded-sm border border-ink-500 p-2"><div class="text-bone-100">{action.title}</div>{#if action.summary}<p class="mt-1 text-bone-400">{action.summary}</p>{/if}</li>{:else}<li class="text-bone-400">No pending approvals.</li>{/each}</ul>{/if}</section>
	<section class="border-b border-ink-500">{@render header("workflow", "workflow", `${workflowActivity.length}`)}{#if open.workflow}<ul class="space-y-2 pb-4">{#each workflowActivity as item}<li><span class="caps text-bone-400">{item.kind} · {item.status}</span><div class="text-bone-100">{item.title}</div>{#if item.detail}<p class="text-bone-400">{item.detail}</p>{/if}</li>{:else}<li class="text-bone-400">No workflow activity.</li>{/each}</ul>{/if}</section>
	<section>{@render header("diagnostics", "diagnostics", thread?.cursor ? `seq ${thread.cursor.seq}` : "")}{#if open.diagnostics}<pre class="mb-4 overflow-auto rounded-sm border border-ink-500 p-2 text-[10px] text-bone-300">{JSON.stringify({ status: thread?.status, messages: thread?.messages.length ?? 0, activity: thread?.activity.length ?? 0, cursor: thread?.cursor }, null, 2)}</pre>{/if}</section>
</aside>
