<script lang="ts">
  import ApprovalCard from './ApprovalCard.svelte'
  import DiffViewer from './DiffViewer.svelte'
  import { ui, type EnvMode, type PopoverKind } from './state.svelte'

  const envs: EnvMode[] = ['local', 'sandbox', 'remote']

  function openChip(kind: PopoverKind, e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    ui.togglePopover(kind, rect)
  }

  // Reactive chip labels
  const modelLabel: Record<string, string> = {
    'opus-4-7': 'Opus 4.7',
    'sonnet-4-6': 'Sonnet 4.6',
    'haiku-4-5': 'Haiku 4.5',
    'gpt-5-5': 'GPT-5.5',
    'gpt-5-4': 'GPT-5.4',
    'gpt-5-4-mini': 'GPT-5.4-Mini',
    'gpt-5-3-codex': 'GPT-5.3-Codex',
    'gpt-4o': 'GPT-4o',
    'gemini-2-5-pro': 'Gemini 2.5 Pro',
    'gemini-2-5-flash': 'Gemini 2.5 Flash',
  }
  const accessLabel: Record<string, string> = {
    'supervised': 'Supervised',
    'auto-accept': 'Auto-accept',
    'full-access': 'Full access',
  }
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const winLabel = $derived(
    ui.contextWindow >= 1_000_000 ? '1M' : `${Math.round(ui.contextWindow / 1000)}k`,
  )
  const tuningLabel = $derived(
    `${cap(ui.effort)} · ${winLabel}${ui.fastMode === 'on' ? ' · Fast' : ''}`,
  )

  // Mock context-window state
  const tokensUsed = 78_400
  const tokenPct = $derived(Math.round((tokensUsed / ui.contextWindow) * 100))
  const ringR = 7
  const ringC = $derived(2 * Math.PI * ringR)
  const ringDash = $derived((tokenPct / 100) * ringC)

  const fmtTokens = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M` : `${Math.round(n / 1000)}k`
  const tokensFmt = $derived(fmtTokens(tokensUsed))
  const windowFmt = $derived(fmtTokens(ui.contextWindow))
</script>

<div class="flex h-full min-h-0">
  <!-- Chat column -->
  <div class="flex min-w-0 flex-1 flex-col">

    <!-- Title -->
    <header class="px-10 pb-5 pt-8">
      <h1 class="text-[18px] font-medium leading-tight tracking-[-0.01em] text-bone-50">
        ApprovalCard · narrow-width fix
      </h1>
      <p class="mt-1.5 caps text-bone-400">
        feature/gui-architecture
      </p>
    </header>

    <!-- Transcript -->
    <div class="min-h-0 flex-1 overflow-y-auto px-10 pb-6">
      <div class="mx-auto max-w-[68ch] space-y-10">

        <article>
          <div class="mb-1.5 flex items-baseline gap-3 caps text-bone-400">
            <span class="text-bone-200">you</span>
            <span class="font-mono text-[10px] tracking-normal">10:31</span>
          </div>
          <p class="text-[14px] leading-[1.7] text-bone-100">
            The ApprovalCard buttons wrap to a second line on the narrow inspector.
            Tighten the layout so the primary action stays on the first row, and keep
            the hatched “yolo” button readable in dark mode.
          </p>
        </article>

        <article>
          <div class="mb-1.5 flex items-baseline gap-3 caps text-bone-400">
            <span class="text-gold">daedalus</span>
            <span class="font-mono text-[10px] tracking-normal">10:32 · plan</span>
          </div>
          <p class="text-[14px] leading-[1.7] text-bone-100">
            Two changes in <code class="font-mono text-[12.5px] text-bone-50">ApprovalCard.svelte</code>:
            reduce the kbd hint to a tooltip when width &lt; 520px, and switch the button
            row to <code class="font-mono text-[12.5px] text-bone-50">flex-wrap: nowrap</code>
            with the ghost button collapsing to an icon. Hatch pattern already uses
            <code class="font-mono text-[12.5px] text-bone-50">currentColor</code>; I'll
            bump the stripe contrast for dark mode.
          </p>
        </article>

        <article>
          <div class="mb-1.5 flex items-baseline gap-3 caps text-bone-400">
            <span class="text-gold">daedalus</span>
            <span class="font-mono text-[10px] tracking-normal">10:34 · build</span>
          </div>
          <p class="text-[14px] leading-[1.7] text-bone-100">
            Applied the layout fix and verified the snapshot at three breakpoints.
          </p>
          <p class="mt-3 font-mono text-[11px] text-bone-400">
            edited &nbsp; <span class="text-bone-100">packages/gui/src/components/ApprovalCard.svelte</span>
          </p>
        </article>

        <article>
          <div class="mb-3 flex items-baseline gap-3 caps text-bone-400">
            <span>system</span>
            <span class="font-mono text-[10px] tracking-normal">10:35 · gate</span>
          </div>
          <ApprovalCard />
        </article>

      </div>
    </div>

    <!-- Composer card — toolbar + textarea + mode row, all bordered together -->
    <footer class="px-10 pb-4 pt-3">
      <div class="mx-auto max-w-[88ch] border border-ink-500 bg-ink-900">

        <!-- BranchToolbar -->
        <div class="flex h-8 items-center gap-4 border-b border-ink-500 px-4">
          <span class="font-mono text-[10.5px] text-bone-300">
            feature/gui-architecture
          </span>
          <span class="text-bone-500">·</span>
          <div class="flex items-center gap-3">
            {#each envs as e}
              <button
                type="button"
                onclick={() => (ui.envMode = e)}
                class="caps transition {ui.envMode === e ? 'text-bone-100' : 'text-bone-400 hover:text-bone-200'}"
              >
                {e}
              </button>
            {/each}
          </div>
          <span class="ml-auto font-mono text-[10px] text-bone-500">
            ~/Research/Daedalus
          </span>
        </div>

        <textarea
          rows="2"
          placeholder="Reply to Daedalus, attach context with @, run a slash command…"
          class="w-full resize-none bg-transparent px-4 pt-3 text-[14px] leading-[1.6] text-bone-50 placeholder:text-bone-400 focus:outline-none"
        ></textarea>

        <!-- Footer row · chip dropdowns + token ring + send -->
        <div class="flex items-center gap-1 border-t border-ink-500 px-2 py-1.5">

          <!-- Model -->
          <button
            type="button"
            onclick={(e) => openChip('model', e)}
            aria-haspopup="dialog"
            aria-expanded={ui.popoverKind === 'model'}
            class="flex items-center gap-1.5 rounded-sm px-2 py-1 text-bone-200 transition hover:bg-ink-850 hover:text-bone-50 {ui.popoverKind === 'model' ? 'bg-ink-850 text-bone-50' : ''}"
          >
            <svg viewBox="0 0 16 16" class="h-3 w-3 text-gold" fill="currentColor" aria-hidden="true">
              <path d="M8 1l1.4 4.6L14 7l-4.6 1.4L8 13l-1.4-4.6L2 7l4.6-1.4z"/>
            </svg>
            <span class="text-[12px]">{modelLabel[ui.modelSlug] ?? ui.modelSlug}</span>
            <span class="text-[9px] text-bone-500">▾</span>
          </button>

          <span class="h-4 w-px bg-ink-500"></span>

          <!-- Effort & limits -->
          <button
            type="button"
            onclick={(e) => openChip('effort', e)}
            aria-haspopup="dialog"
            aria-expanded={ui.popoverKind === 'effort'}
            class="flex items-center gap-1.5 rounded-sm px-2 py-1 text-bone-200 transition hover:bg-ink-850 hover:text-bone-50 {ui.popoverKind === 'effort' ? 'bg-ink-850 text-bone-50' : ''}"
          >
            <span class="text-[12px]">{tuningLabel}</span>
            <span class="text-[9px] text-bone-500">▾</span>
          </button>

          <span class="h-4 w-px bg-ink-500"></span>

          <!-- Mode -->
          <button
            type="button"
            onclick={(e) => openChip('mode', e)}
            aria-haspopup="dialog"
            aria-expanded={ui.popoverKind === 'mode'}
            class="flex items-center gap-1.5 rounded-sm px-2 py-1 text-bone-200 transition hover:bg-ink-850 hover:text-bone-50 {ui.popoverKind === 'mode' ? 'bg-ink-850 text-bone-50' : ''}"
          >
            <svg viewBox="0 0 16 16" class="h-3 w-3 text-bone-300" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 13l4-4 2 2 4-4"/>
              <path d="M11 4h2v2"/>
            </svg>
            <span class="text-[12px] capitalize">{ui.composerMode}</span>
            <span class="text-[9px] text-bone-500">▾</span>
          </button>

          <span class="h-4 w-px bg-ink-500"></span>

          <!-- Access -->
          <button
            type="button"
            onclick={(e) => openChip('access', e)}
            aria-haspopup="dialog"
            aria-expanded={ui.popoverKind === 'access'}
            class="flex items-center gap-1.5 rounded-sm px-2 py-1 text-bone-200 transition hover:bg-ink-850 hover:text-bone-50 {ui.popoverKind === 'access' ? 'bg-ink-850 text-bone-50' : ''}"
          >
            <svg viewBox="0 0 16 16" class="h-3 w-3 text-bone-300" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="7" width="10" height="6" rx="1"/>
              <path d="M5 7V5a3 3 0 0 1 6 0v2"/>
            </svg>
            <span class="text-[12px]">{accessLabel[ui.access]}</span>
            <span class="text-[9px] text-bone-500">▾</span>
          </button>

          <span class="ml-auto"></span>

          <!-- Context-window ring -->
          <span class="group relative flex h-6 w-6 items-center justify-center" role="img" aria-label="{tokensUsed.toLocaleString()} of {ui.contextWindow.toLocaleString()} tokens used">
            <svg viewBox="0 0 18 18" class="h-6 w-6 -rotate-90">
              <circle cx="9" cy="9" r={ringR} fill="none" stroke="var(--color-ink-500)" stroke-width="1.5"/>
              <circle
                cx="9" cy="9" r={ringR}
                fill="none"
                stroke="var(--color-gold-soft)"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-dasharray={ringC}
                stroke-dashoffset={ringC - ringDash}
              />
            </svg>
            <span class="absolute font-mono text-[8px] text-bone-300 tabular-nums">{tokenPct}</span>

            <!-- Hover tooltip -->
            <span
              role="tooltip"
              class="pointer-events-none absolute bottom-full right-0 mb-2 hidden whitespace-nowrap border border-ink-500 bg-ink-900 px-3 py-2 text-left shadow-2xl shadow-black/40 group-hover:block"
            >
              <span class="block caps text-bone-400">context window</span>
              <span class="mt-0.5 block font-mono text-[11px] text-bone-100 tabular-nums">
                {tokenPct}% <span class="text-bone-500">·</span> {tokensFmt}/{windowFmt} context used
              </span>
            </span>
          </span>

          <!-- Send -->
          <button
            type="button"
            aria-label="Send"
            class="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-gold text-ink-950 transition hover:bg-bone-50"
          >
            <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M8 13V3"/>
              <path d="M4 7l4-4 4 4"/>
            </svg>
          </button>
        </div>
      </div>
    </footer>
  </div>

  <!-- Inline diff panel · T3Code DiffPanelShell -->
  {#if ui.diffPath && ui.diffMount === 'inline'}
    <aside
      class="min-h-0 shrink-0 overflow-hidden border-l border-ink-500"
      style="width: clamp(360px, 42vw, 560px)"
    >
      <DiffViewer />
    </aside>
  {/if}
</div>
