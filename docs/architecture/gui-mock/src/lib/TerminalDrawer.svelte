<script lang="ts">
  import { ui } from './state.svelte'

  type Tab = { id: string; title: string; cwd: string; live?: boolean }

  const tabs: Tab[] = [
    { id: 'a', title: 'feature/gui-architecture', cwd: '~/Research/Daedalus',                       live: true },
    { id: 'b', title: 'fix/approval-card-wrap',   cwd: '~/Research/Daedalus.worktrees/approval-fix' },
    { id: 'c', title: 'spike/dark-mode-tokens',   cwd: '~/Research/Daedalus.worktrees/dark-tokens'  },
  ]

  let activeId = $state<string>('a')

  type LogLine = { stream: 'cmd' | 'out' | 'err' | 'ok'; text: string; ts?: string }

  const logsByTab: Record<string, LogLine[]> = {
    a: [
      { stream: 'cmd', text: 'pnpm --filter gui dev',                                        ts: '10:31:02' },
      { stream: 'out', text: 'VITE v7.3.2  ready in 421 ms',                                  ts: '10:31:03' },
      { stream: 'out', text: '➜  Local:   http://localhost:5173/',                            ts: '10:31:03' },
      { stream: 'cmd', text: 'pnpm --filter gui test -- ApprovalCard',                        ts: '10:34:18' },
      { stream: 'out', text: '✓ ApprovalCard renders three buttons       (12 ms)',            ts: '10:34:19' },
      { stream: 'out', text: '✓ ApprovalCard wraps tools list             (8 ms)',             ts: '10:34:19' },
      { stream: 'err', text: '✗ ApprovalCard layout @ 480px               (snapshot mismatch)', ts: '10:34:19' },
      { stream: 'ok',  text: 'snapshot updated · awaiting approval to commit',                ts: '10:34:21' },
    ],
    b: [
      { stream: 'cmd', text: 'git status', ts: '10:22:00' },
      { stream: 'out', text: 'On branch fix/approval-card-wrap', ts: '10:22:00' },
      { stream: 'out', text: 'Your branch is up to date with origin/fix/approval-card-wrap.', ts: '10:22:00' },
      { stream: 'out', text: 'nothing to commit, working tree clean', ts: '10:22:00' },
    ],
    c: [
      { stream: 'cmd', text: 'rg "color-gold" --type css', ts: '09:50:14' },
      { stream: 'out', text: 'app.css:23: --color-gold:      #c9a961;', ts: '09:50:14' },
      { stream: 'out', text: 'app.css:24: --color-gold-soft: #8a7440;', ts: '09:50:14' },
    ],
  }

  function streamColor(s: LogLine['stream']): string {
    if (s === 'cmd') return 'text-gold'
    if (s === 'err') return 'text-blood'
    if (s === 'ok')  return 'text-bone-100'
    return 'text-bone-300'
  }
  function streamGlyph(s: LogLine['stream']): string {
    if (s === 'cmd') return '$'
    if (s === 'err') return '!'
    if (s === 'ok')  return '✓'
    return ' '
  }

  // Per-tab prompt buffer — stays mounted across switches (Jean pattern).
  let prompts = $state<Record<string, string>>({ a: '', b: '', c: '' })

  const active = $derived(tabs.find(t => t.id === activeId) ?? tabs[0])
</script>

<section
  class="flex h-[42vh] shrink-0 flex-col border-t border-ink-400 bg-ink-900"
  aria-label="Terminal"
>
  <!-- Tab bar -->
  <header class="flex items-stretch border-b border-ink-500">
    <div class="flex flex-1 items-stretch">
      {#each tabs as t}
        <button
          type="button"
          onclick={() => (activeId = t.id)}
          class="group flex items-center gap-2 border-r border-ink-500 px-4 py-2 transition {activeId === t.id
            ? 'bg-ink-850 text-bone-50'
            : 'text-bone-400 hover:bg-ink-850 hover:text-bone-200'}"
        >
          <span
            class="inline-block h-1 w-1 rounded-full {t.live ? 'bg-gold' : 'bg-bone-500'}"
          ></span>
          <span class="font-mono text-[11px]">{t.title}</span>
        </button>
      {/each}
      <button
        type="button"
        class="px-3 caps text-bone-400 transition hover:text-bone-100"
        aria-label="New terminal"
      >+</button>
    </div>

    <div class="flex items-center gap-4 border-l border-ink-500 px-4 caps text-bone-400">
      <span class="font-mono text-[10.5px] tracking-normal text-bone-500">{active.cwd}</span>
      <button
        type="button"
        onclick={() => ui.toggleTerminal()}
        class="transition hover:text-bone-100"
        aria-label="Collapse terminal"
      >
        collapse
        <span class="ml-2 font-mono text-[10px] tracking-normal text-bone-500">Super+`</span>
      </button>
    </div>
  </header>

  <!-- Panes — all mounted, only active visible -->
  <div class="relative min-h-0 flex-1">
    {#each tabs as t}
      <div
        class="absolute inset-0 flex flex-col {activeId === t.id ? '' : 'invisible pointer-events-none'}"
        aria-hidden={activeId !== t.id}
      >
        <div class="min-h-0 flex-1 overflow-y-auto bg-ink-950 px-5 py-3 font-mono text-[12px] leading-[1.7]">
          {#each logsByTab[t.id] ?? [] as l}
            <div class="grid grid-cols-[78px_14px_1fr] gap-x-3">
              <span class="select-none text-bone-500">{l.ts ?? ''}</span>
              <span class="select-none {streamColor(l.stream)}">{streamGlyph(l.stream)}</span>
              <span class={streamColor(l.stream)}>{l.text}</span>
            </div>
          {/each}
        </div>

        <div class="flex items-center gap-3 border-t border-ink-500 px-5 py-2 font-mono text-[12px]">
          <span class="text-gold">$</span>
          <input
            type="text"
            bind:value={prompts[t.id]}
            placeholder={`type a command in ${t.title}…`}
            class="flex-1 bg-transparent text-bone-50 placeholder:text-bone-400 focus:outline-none"
          />
          <span class="caps text-bone-400">
            <kbd class="rounded-sm border border-ink-500 px-1.5 py-px text-[10px] tracking-normal text-bone-300">↵</kbd>
            run
          </span>
        </div>
      </div>
    {/each}
  </div>
</section>
