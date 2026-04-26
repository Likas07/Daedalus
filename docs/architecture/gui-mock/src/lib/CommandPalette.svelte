<script lang="ts">
  import { ui } from './state.svelte'

  type Item = { label: string; sub?: string; kbd?: string; group: string; run: () => void }

  let q = $state('')

  const items: Item[] = [
    { label: 'ApprovalCard · narrow-width fix', sub: 'session · live', group: 'sessions', run: () => ui.open('session') },
    { label: 'CLI parity review',                sub: 'session · paused', group: 'sessions', run: () => ui.open('session') },
    { label: 'Provider cleanup',                 sub: 'session · archived', group: 'sessions', run: () => ui.open('empty') },

    { label: 'ApprovalCard.svelte',                                  sub: 'packages/gui/src/components', group: 'files', run: () => ui.openDiff('packages/gui/src/components/ApprovalCard.svelte') },
    { label: 'AutomationRulesPanel.svelte',                          sub: 'packages/gui/src/components', group: 'files', run: () => ui.openDiff('packages/gui/src/components/AutomationRulesPanel.svelte') },
    { label: 'gui-wireframe-jean-t3code-rationale.md',               sub: 'docs/architecture',           group: 'files', run: () => ui.openDiff('docs/architecture/gui-wireframe-jean-t3code-rationale.md') },

    { label: 'New session',         kbd: 'Super+N',       group: 'commands', run: () => ui.open('session') },
    { label: 'Toggle terminal',     kbd: 'Super+`',       group: 'commands', run: () => ui.toggleTerminal() },
    { label: 'Switch worktree',     kbd: 'Super+Shift+W', group: 'commands', run: () => ui.open('session') },
    { label: 'Approve all blocked', kbd: 'Super+Shift+A', group: 'commands', run: () => ui.open('session') },

    { label: 'Providers',     sub: 'API keys, default model',     group: 'settings', run: () => ui.open('settings') },
    { label: 'Appearance',    sub: 'theme, density',              group: 'settings', run: () => ui.open('settings') },
    { label: 'Keybindings',   sub: 'global shortcuts',            group: 'settings', run: () => ui.open('settings') },
    { label: 'Integrations',  sub: 'GitHub, Linear',              group: 'settings', run: () => ui.open('settings') },
  ]

  const filtered = $derived(
    q.trim().length === 0
      ? items
      : items.filter(i =>
          (i.label + ' ' + (i.sub ?? '')).toLowerCase().includes(q.toLowerCase()),
        ),
  )

  const groups = $derived(
    Array.from(
      filtered.reduce<Map<string, Item[]>>((acc, it) => {
        const arr = acc.get(it.group) ?? []
        arr.push(it)
        acc.set(it.group, arr)
        return acc
      }, new Map()),
    ),
  )

  let activeIndex = $state(0)
  const flat = $derived(filtered)

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIndex = Math.min(activeIndex + 1, flat.length - 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIndex = Math.max(activeIndex - 1, 0)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flat[activeIndex]
      if (item) {
        item.run()
        ui.paletteOpen = false
      }
    }
  }

  function pick(i: Item) {
    i.run()
    ui.paletteOpen = false
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- Backdrop -->
<button
  type="button"
  aria-label="Close palette"
  onclick={() => (ui.paletteOpen = false)}
  class="fixed inset-0 z-40 bg-ink-950/70"
></button>

<!-- Panel -->
<div class="pointer-events-none fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
  <div class="pointer-events-auto w-[min(640px,90vw)] border border-ink-400 bg-ink-900 shadow-[0_30px_80px_rgba(0,0,0,0.7)]">

    <!-- Search row -->
    <div class="flex items-center gap-3 border-b border-ink-500 px-5 py-3">
      <svg viewBox="0 0 16 16" class="h-3.5 w-3.5 text-bone-400" fill="none" stroke="currentColor" stroke-width="1.4">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L13 13" stroke-linecap="round" />
      </svg>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="text"
        autofocus
        bind:value={q}
        oninput={() => (activeIndex = 0)}
        placeholder="Search sessions, files, commands…"
        class="flex-1 bg-transparent text-[14px] text-bone-50 placeholder:text-bone-400 focus:outline-none"
      />
      <kbd class="rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[10px] text-bone-300">esc</kbd>
    </div>

    <!-- Results -->
    <div class="max-h-[55vh] overflow-y-auto py-2">
      {#if filtered.length === 0}
        <div class="px-5 py-8 text-center text-[12.5px] text-bone-400">No matches.</div>
      {:else}
        {#each groups as [group, list]}
          <div class="px-5 pt-3 pb-1 label-caps text-bone-400">{group}</div>
          <ul>
            {#each list as item}
              {@const idx = flat.indexOf(item)}
              <li>
                <button
                  type="button"
                  onclick={() => pick(item)}
                  onmouseenter={() => (activeIndex = idx)}
                  class="flex w-full items-baseline justify-between gap-4 px-5 py-2 text-left transition {activeIndex === idx
                    ? 'bg-ink-800 text-bone-50'
                    : 'text-bone-200 hover:bg-ink-800'}"
                >
                  <span class="flex min-w-0 items-baseline gap-3">
                    <span class="truncate text-[13px]">{item.label}</span>
                    {#if item.sub}
                      <span class="truncate font-mono text-[10.5px] text-bone-400">— {item.sub}</span>
                    {/if}
                  </span>
                  {#if item.kbd}
                    <kbd class="rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[10px] tracking-normal text-bone-300">{item.kbd}</kbd>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/each}
      {/if}
    </div>

    <!-- Foot -->
    <div class="flex items-center justify-between border-t border-ink-500 px-5 py-2 caps text-bone-400">
      <span class="flex items-center gap-3">
        <span class="flex items-center gap-1.5">
          <kbd class="rounded-sm border border-ink-500 px-1 py-px font-mono text-[9.5px] tracking-normal text-bone-300">↑↓</kbd>
          navigate
        </span>
        <span class="flex items-center gap-1.5">
          <kbd class="rounded-sm border border-ink-500 px-1 py-px font-mono text-[9.5px] tracking-normal text-bone-300">↵</kbd>
          select
        </span>
      </span>
      <span>{filtered.length} of {items.length}</span>
    </div>
  </div>
</div>
