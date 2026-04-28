<script lang="ts">
	import type { WorkflowChangedFile } from "@daedalus-pi/app-server-protocol";
	import type { RendererTerminal } from "../client/gui-state-types";

	const {
		files = [],
		terminals = [],
		approvals = 0,
		errors = [],
		worktreePath,
		branch,
		onOpenInEditor,
		onContinue,
		onClose,
	} = $props<{
		files?: readonly WorkflowChangedFile[];
		terminals?: readonly RendererTerminal[];
		approvals?: number;
		errors?: readonly string[];
		worktreePath?: string;
		branch?: string | null;
		onOpenInEditor?: () => void | Promise<void>;
		onContinue?: () => void | Promise<void>;
		onClose?: () => void | Promise<void>;
	}>();

	const commands = $derived([
		`cd ${shellQuote(worktreePath ?? ".")}`,
		"git status --short",
		"git diff --stat",
		branch ? `git branch --show-current # ${branch}` : "git branch --show-current",
	].join("\n"));
	const completedCommands = $derived(terminals.filter((terminal: RendererTerminal) => terminal.history.trim() || terminal.status !== "running"));

	function shellQuote(value: string): string {
		return `'${value.replaceAll("'", "'\\''")}'`;
	}

	async function copyGitCommands(): Promise<void> {
		await navigator.clipboard?.writeText(commands);
	}
</script>

<section class="rounded-md border border-[color:var(--rule)] bg-[color:var(--ink-2)] p-4" data-testid="closeout-receipt">
	<header class="mb-3 flex items-start justify-between gap-3">
		<div>
			<div class="eyebrow eyebrow-brass">closeout · receipt</div>
			<h3 class="mt-0.5 font-display text-[18px] italic text-[color:var(--bone)]">Review handoff</h3>
		</div>
		<span class="pill">non-mutating</span>
	</header>

	<div class="grid gap-3 font-mono text-[11px] text-[color:var(--bone-soft)] md:grid-cols-2">
		<div><span class="text-[color:var(--bone-faint)]">worktree</span><br />{worktreePath ?? "not selected"}</div>
		<div><span class="text-[color:var(--bone-faint)]">branch</span><br />{branch ?? "detached"}</div>
		<div><span class="text-[color:var(--bone-faint)]">files changed</span><br />{files.length}</div>
		<div><span class="text-[color:var(--bone-faint)]">commands/tests run</span><br />{completedCommands.length}</div>
		<div><span class="text-[color:var(--bone-faint)]">unresolved approvals</span><br />{approvals}</div>
		<div><span class="text-[color:var(--bone-faint)]">errors</span><br />{errors.length ? errors.join(", ") : "none recorded"}</div>
	</div>

	{#if files.length}
		<ul class="mt-3 max-h-24 overflow-auto border-t border-[color:var(--rule)] pt-2 font-mono text-[10.5px] text-[color:var(--bone-faint)]">
			{#each files as file}
				<li>{file.status} · {file.path}</li>
			{/each}
		</ul>
	{/if}

	<div class="mt-4 flex flex-wrap gap-2">
		<button class="btn-mini" type="button" onclick={() => void onOpenInEditor?.()}>Open in editor</button>
		<button class="btn-mini" type="button" onclick={() => void copyGitCommands()}>Copy git commands</button>
		<button class="btn-mini" type="button" onclick={() => void onContinue?.()}>Continue</button>
		<button class="btn-mini" type="button" onclick={() => void onClose?.()}>Close</button>
	</div>
</section>
