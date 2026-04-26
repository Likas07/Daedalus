<script lang="ts">
  import { ui } from './state.svelte'

  type Mode = 'split' | 'unified'
  const inline = $derived(ui.diffMount === 'inline')
  let mode = $state<Mode>('unified')

  type Row = { kind: 'ctx' | 'add' | 'rem'; left?: string; right?: string }
  type Hunk = {
    title: string
    active?: boolean
    leftStart: number
    rightStart: number
    rows: Row[]
  }

  const path = $derived(ui.diffPath ?? 'packages/gui/src/components/ApprovalCard.svelte')

  const hunks: Hunk[] = [
    {
      title: '@@ -42,7 +42,9 @@ approval card · header',
      leftStart: 42,
      rightStart: 42,
      rows: [
        { kind: 'ctx', left: 'export function ApprovalCard(props) {',  right: 'export function ApprovalCard(props) {' },
        { kind: 'ctx', left: '  const { tools, onApprove } = props',     right: '  const { tools, onApprove } = props' },
        { kind: 'rem', left: "  return (<div class=\"flex flex-wrap\">", right: '' },
        { kind: 'add', left: '',                                          right: "  return (<div class=\"flex flex-nowrap\">" },
        { kind: 'add', left: '',                                          right: '    {/* primary action stays on the first row */}' },
        { kind: 'ctx', left: '    <Header tools={tools} />',              right: '    <Header tools={tools} />' },
      ],
    },
    {
      title: '@@ -97,5 +99,9 @@ button group · dark-mode hatch',
      active: true,
      leftStart: 97,
      rightStart: 99,
      rows: [
        { kind: 'ctx', left: '  <button class="ac-btn-yolo">',                                   right: '  <button class="ac-btn-yolo">' },
        { kind: 'rem', left: '    background: repeating-linear-gradient(135deg, #ink 0 5px);',   right: '' },
        { kind: 'add', left: '',                                                                  right: '    background: repeating-linear-gradient(135deg,' },
        { kind: 'add', left: '',                                                                  right: '      var(--color-gold-700) 0 6px,' },
        { kind: 'add', left: '',                                                                  right: '      var(--color-gold-900) 6px 7px);' },
        { kind: 'ctx', left: '  </button>',                                                       right: '  </button>' },
      ],
    },
    {
      title: '@@ -142,3 +148,3 @@ a11y · keyboard order',
      leftStart: 142,
      rightStart: 148,
      rows: [
        { kind: 'rem', left: '  <button tabindex="0">Cancel</button>', right: '' },
        { kind: 'add', left: '',                                       right: '  <button tabindex="-1">Cancel</button>' },
      ],
    },
  ]

  function lineClass(kind: Row['kind']): string {
    if (kind === 'add') return 'bg-gold/[0.06] text-bone-100'
    if (kind === 'rem') return 'bg-blood/[0.10] text-bone-200'
    return 'text-bone-300'
  }
  function gutterClass(kind: Row['kind']): string {
    if (kind === 'add') return 'text-gold-soft'
    if (kind === 'rem') return 'text-bone-400'
    return 'text-bone-500'
  }
</script>

<div class="flex h-full flex-col bg-ink-950">

  <!-- Head -->
  <header class="flex items-center gap-3 border-b border-ink-500 px-5 py-2.5">
    <button
      type="button"
      onclick={() => ui.closeDiff()}
      aria-label="Close diff"
      class="caps text-bone-400 transition hover:text-bone-100"
    >
      ✕
    </button>

    <div class="min-w-0 flex-1">
      <div class="caps text-bone-400">diff</div>
      <div class="truncate font-mono text-[11.5px] text-bone-50">{path}</div>
    </div>

    <div class="flex items-center gap-3 caps">
      <span class="text-bone-400">+18 <span class="text-bone-500">/</span> −6</span>
      {#if !inline}
        <span class="flex items-center gap-3">
          <button
            type="button"
            onclick={() => (mode = 'split')}
            class={mode === 'split' ? 'text-gold' : 'text-bone-400 hover:text-bone-100'}
          >split</button>
          <button
            type="button"
            onclick={() => (mode = 'unified')}
            class={mode === 'unified' ? 'text-gold' : 'text-bone-400 hover:text-bone-100'}
          >unified</button>
        </span>
      {/if}
    </div>
  </header>

  <!-- Body -->
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="px-4 py-4">
      {#each hunks as h}
        <article class="mb-5 border {h.active ? 'border-l-2 border-l-gold border-ink-500' : 'border-ink-500'}">
          <header class="flex items-center justify-between gap-3 border-b border-ink-500 px-3 py-1.5 font-mono text-[10px] text-bone-400">
            <span class="truncate">{h.title}</span>
            {#if h.active}<span class="caps shrink-0 text-gold">active</span>{/if}
          </header>

          {#if mode === 'split' && !inline}
            <div class="grid grid-cols-2 divide-x divide-ink-500 font-mono text-[11.5px] leading-[1.65]">
              <div>
                {#each h.rows as r, i}
                  <div class="grid grid-cols-[36px_1fr] {lineClass(r.kind === 'add' ? 'ctx' : r.kind)}">
                    <span class="select-none border-r border-ink-500 px-2 py-0.5 text-right tabular-nums {gutterClass(r.kind === 'add' ? 'ctx' : r.kind)}">
                      {r.kind === 'add' ? '' : h.leftStart + i}
                    </span>
                    <span class="whitespace-pre px-2 py-0.5">
                      {r.kind === 'rem' ? '−' : ' '}{r.left ?? ''}
                    </span>
                  </div>
                {/each}
              </div>
              <div>
                {#each h.rows as r, i}
                  <div class="grid grid-cols-[36px_1fr] {lineClass(r.kind === 'rem' ? 'ctx' : r.kind)}">
                    <span class="select-none border-r border-ink-500 px-2 py-0.5 text-right tabular-nums {gutterClass(r.kind === 'rem' ? 'ctx' : r.kind)}">
                      {r.kind === 'rem' ? '' : h.rightStart + i}
                    </span>
                    <span class="whitespace-pre px-2 py-0.5">
                      {r.kind === 'add' ? '+' : ' '}{r.right ?? ''}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <div class="font-mono text-[11.5px] leading-[1.65]">
              {#each h.rows as r, i}
                <div class="grid grid-cols-[32px_32px_1fr] {lineClass(r.kind)}">
                  <span class="select-none border-r border-ink-500 px-1.5 py-0.5 text-right tabular-nums {gutterClass(r.kind)}">{r.kind === 'add' ? '' : h.leftStart + i}</span>
                  <span class="select-none border-r border-ink-500 px-1.5 py-0.5 text-right tabular-nums {gutterClass(r.kind)}">{r.kind === 'rem' ? '' : h.rightStart + i}</span>
                  <span class="whitespace-pre px-2 py-0.5">{r.kind === 'add' ? '+' : r.kind === 'rem' ? '−' : ' '}{r.kind === 'rem' ? r.left : r.right}</span>
                </div>
              {/each}
            </div>
          {/if}
        </article>
      {/each}
    </div>
  </div>

  <!-- Foot -->
  <footer class="flex items-center justify-between gap-3 border-t border-ink-500 px-5 py-3 caps">
    <span class="text-bone-400">
      <kbd class="rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[10px] tracking-normal text-bone-300">j</kbd>
      <span class="mx-1">/</span>
      <kbd class="rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[10px] tracking-normal text-bone-300">k</kbd>
    </span>
    <span class="flex items-center gap-3">
      <button class="text-bone-300 transition hover:text-bone-50">stage</button>
      <button class="text-bone-400 transition hover:text-bone-100">discard</button>
      <button class="text-gold transition hover:text-bone-50">commit</button>
    </span>
  </footer>
</div>
