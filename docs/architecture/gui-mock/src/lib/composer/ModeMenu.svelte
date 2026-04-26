<script lang="ts">
  import { ui, type ComposerMode } from '../state.svelte'

  type Mode = { id: ComposerMode; label: string; sub: string; kbd: string }
  const modes: Mode[] = [
    { id: 'plan',  label: 'Plan',  sub: 'Read-only · propose a step list', kbd: 'Shift+P' },
    { id: 'code',  label: 'Code',  sub: 'Edit files in this worktree',     kbd: 'Shift+C' },
    { id: 'agent', label: 'Agent', sub: 'Long-running with subagents',     kbd: 'Shift+A' },
  ]

  function pick(m: Mode) {
    ui.composerMode = m.id
    ui.closePopover()
  }
</script>

<div class="flex h-full min-h-0 flex-col">
  <div class="border-b border-ink-500 px-3 py-2">
    <div class="caps text-bone-400">workflow mode</div>
  </div>

  <ul class="min-h-0 flex-1 overflow-y-auto divide-y divide-ink-500">
    {#each modes as m}
      {@const on = ui.composerMode === m.id}
      <li>
        <button
          type="button"
          onclick={() => pick(m)}
          class="grid w-full grid-cols-[14px_1fr_auto] items-start gap-2 px-3 py-2 text-left transition hover:bg-ink-850"
        >
          <span class="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full {on ? 'bg-gold' : 'bg-ink-500'}"></span>
          <div class="min-w-0">
            <div class="text-[12.5px] {on ? 'font-medium text-bone-50' : 'text-bone-100'}">{m.label}</div>
            <div class="truncate font-mono text-[10px] text-bone-400">{m.sub}</div>
          </div>
          <kbd class="mt-0.5 rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[9.5px] text-bone-400">{m.kbd}</kbd>
        </button>
      </li>
    {/each}
  </ul>
</div>
