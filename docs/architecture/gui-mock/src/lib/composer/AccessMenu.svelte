<script lang="ts">
  import { ui, type AccessMode } from '../state.svelte'

  type Access = { id: AccessMode; label: string; sub: string; kbd: string }
  const modes: Access[] = [
    { id: 'supervised',  label: 'Supervised',       sub: 'Approve every edit and command', kbd: 'Super+Shift+1' },
    { id: 'auto-accept', label: 'Auto-accept edits', sub: 'Edits applied · commands gated',  kbd: 'Super+Shift+2' },
    { id: 'full-access', label: 'Full access',       sub: 'No prompts · use with caution',   kbd: 'Super+Shift+3' },
  ]

  function pick(a: Access) {
    ui.access = a.id
    ui.closePopover()
  }

  // Lock glyph state per row
  function glyphFor(id: AccessMode): { stroke: string; path: string } {
    if (id === 'supervised') {
      return { stroke: 'currentColor', path: 'M5 7V5a3 3 0 0 1 6 0v2' }
    } else if (id === 'auto-accept') {
      return { stroke: 'currentColor', path: 'M5 7V5a3 3 0 0 1 5.5-1.6' }
    } else {
      return { stroke: 'currentColor', path: 'M5 7V5a3 3 0 0 1 6 0' }
    }
  }
</script>

<div class="flex h-full min-h-0 flex-col">
  <div class="border-b border-ink-500 px-3 py-2">
    <div class="caps text-bone-400">approvals</div>
  </div>

  <ul class="min-h-0 flex-1 overflow-y-auto divide-y divide-ink-500">
    {#each modes as a}
      {@const on = ui.access === a.id}
      {@const g = glyphFor(a.id)}
      <li>
        <button
          type="button"
          onclick={() => pick(a)}
          class="grid w-full grid-cols-[16px_1fr_auto] items-start gap-2 px-3 py-2 text-left transition hover:bg-ink-850"
        >
          <svg
            viewBox="0 0 16 16"
            class="mt-0.5 h-3.5 w-3.5 {on ? 'text-gold' : 'text-bone-400'}"
            fill="none"
            stroke={g.stroke}
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="7" width="10" height="6" rx="1"/>
            <path d={g.path}/>
          </svg>
          <div class="min-w-0">
            <div class="text-[12.5px] {on ? 'font-medium text-bone-50' : 'text-bone-100'}">{a.label}</div>
            <div class="truncate font-mono text-[10px] text-bone-400">{a.sub}</div>
          </div>
          <kbd class="mt-0.5 rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[9.5px] text-bone-400">{a.kbd}</kbd>
        </button>
      </li>
    {/each}
  </ul>
</div>
