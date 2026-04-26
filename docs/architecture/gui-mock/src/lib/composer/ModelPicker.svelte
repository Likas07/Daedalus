<script lang="ts">
  import { ui, type ProviderKind } from '../state.svelte'

  type Provider = { id: ProviderKind | 'favorites'; label: string; glyph: string }
  const providers: Provider[] = [
    { id: 'favorites', label: 'Favorites', glyph: '★' },
    { id: 'anthropic', label: 'Anthropic', glyph: '✦' },
    { id: 'openai',    label: 'OpenAI',    glyph: '◎' },
    { id: 'google',    label: 'Google',    glyph: '◆' },
  ]

  type Model = { slug: string; name: string; sub?: string; provider: ProviderKind }
  const allModels: Model[] = [
    // Anthropic
    { slug: 'opus-4-7',     name: 'Opus 4.7',    sub: 'Daedalus default', provider: 'anthropic' },
    { slug: 'sonnet-4-6',   name: 'Sonnet 4.6',  sub: 'Code',             provider: 'anthropic' },
    { slug: 'haiku-4-5',    name: 'Haiku 4.5',   sub: 'Fast',             provider: 'anthropic' },
    // OpenAI
    { slug: 'gpt-5-5',       name: 'GPT-5.5',      sub: 'Codex',  provider: 'openai' },
    { slug: 'gpt-5-4',       name: 'GPT-5.4',      sub: 'Codex',  provider: 'openai' },
    { slug: 'gpt-5-4-mini',  name: 'GPT-5.4-Mini', sub: 'Codex',  provider: 'openai' },
    { slug: 'gpt-5-3-codex', name: 'GPT-5.3-Codex',sub: 'Codex',  provider: 'openai' },
    { slug: 'gpt-4o',        name: 'GPT-4o',       sub: 'Vision', provider: 'openai' },
    // Google
    { slug: 'gemini-2-5-pro',   name: 'Gemini 2.5 Pro',   sub: 'Long context', provider: 'google' },
    { slug: 'gemini-2-5-flash', name: 'Gemini 2.5 Flash', sub: 'Fast',         provider: 'google' },
  ]

  let selectedRail = $state<ProviderKind | 'favorites'>(
    ui.favorites.length > 0 ? 'favorites' : ui.modelProvider,
  )
  let query = $state('')
  let highlightedIndex = $state(0)

  const visibleModels = $derived.by(() => {
    let list = allModels
    if (selectedRail === 'favorites') {
      list = list.filter(m => ui.favorites.includes(`${m.provider}:${m.slug}`))
    } else {
      list = list.filter(m => m.provider === selectedRail)
    }
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(m =>
        m.name.toLowerCase().includes(q) || (m.sub?.toLowerCase().includes(q) ?? false),
      )
    }
    return list
  })

  $effect(() => {
    void visibleModels
    highlightedIndex = 0
  })

  function selectModel(m: Model) {
    ui.modelProvider = m.provider
    ui.modelSlug = m.slug
    ui.closePopover()
  }

  function onSearchKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); highlightedIndex = Math.min(highlightedIndex + 1, visibleModels.length - 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlightedIndex = Math.max(highlightedIndex - 1, 0) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const m = visibleModels[highlightedIndex]
      if (m) selectModel(m)
    } else if (e.key === 'Escape') {
      e.preventDefault(); ui.closePopover()
    }
  }
</script>

<div class="flex h-full min-h-0">
  <!-- Provider rail -->
  <div class="flex w-12 shrink-0 flex-col gap-1 border-r border-ink-500 bg-ink-950 p-1 overflow-y-auto">
    {#each providers as p, i}
      <button
        type="button"
        onclick={() => (selectedRail = p.id)}
        title={p.label}
        aria-label={p.label}
        aria-pressed={selectedRail === p.id}
        class="relative flex aspect-square w-full items-center justify-center rounded-sm transition {selectedRail === p.id
          ? 'bg-ink-850 text-bone-50'
          : 'text-bone-400 hover:bg-ink-850 hover:text-bone-100'}"
      >
        {#if selectedRail === p.id}
          <span class="absolute right-0 top-1/2 h-4 w-px -translate-y-1/2 bg-gold"></span>
        {/if}
        <span class="text-[14px] {p.id === 'favorites' && selectedRail === p.id ? 'text-gold' : ''}">{p.glyph}</span>
      </button>
      {#if i === 0}<span class="my-0.5 h-px bg-ink-500"></span>{/if}
    {/each}
  </div>

  <!-- Right pane -->
  <div class="flex min-w-0 flex-1 flex-col">
    <!-- Search -->
    <div class="border-b border-ink-500 px-3 py-2">
      <div class="flex items-center gap-2 rounded-sm border border-ink-500 bg-ink-950 px-2 py-1">
        <svg viewBox="0 0 16 16" class="h-3 w-3 text-bone-400" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5"/>
          <path d="M10.5 10.5L13 13" stroke-linecap="round"/>
        </svg>
        <input
          type="text"
          bind:value={query}
          onkeydown={onSearchKey}
          autofocus
          placeholder="Search models…"
          class="min-w-0 flex-1 bg-transparent text-[12.5px] text-bone-50 placeholder:text-bone-400 focus:outline-none"
        />
      </div>
    </div>

    <!-- List -->
    <div class="min-h-0 flex-1 overflow-y-auto py-1">
      {#if visibleModels.length === 0}
        <div class="px-4 py-6 text-center text-[12px] text-bone-400">
          No models found.
        </div>
      {:else}
        <ul class="divide-y divide-ink-500">
          {#each visibleModels as m, i}
            {@const key = `${m.provider}:${m.slug}`}
            {@const fav = ui.favorites.includes(key)}
            {@const selected = ui.modelProvider === m.provider && ui.modelSlug === m.slug}
            <li>
              <div
                class="group grid grid-cols-[16px_1fr_auto] items-start gap-2 px-3 py-2 transition {highlightedIndex === i
                  ? 'bg-ink-850'
                  : ''} {selected ? 'text-bone-50' : 'text-bone-200'}"
                role="button"
                tabindex="0"
                onclick={() => selectModel(m)}
                onmouseenter={() => (highlightedIndex = i)}
                onkeydown={(e) => e.key === 'Enter' && selectModel(m)}
              >
                <button
                  type="button"
                  onclick={(e) => { e.stopPropagation(); ui.toggleFavorite(key) }}
                  aria-label={fav ? 'Unfavorite' : 'Favorite'}
                  class="mt-0.5 text-[12px] transition {fav ? 'text-gold' : 'text-bone-500 hover:text-bone-200'}"
                >★</button>

                <div class="min-w-0">
                  <div class="flex items-center gap-2 text-[12.5px] font-medium {selected ? 'text-bone-50' : 'text-bone-100'}">
                    <span class="truncate">{m.name}</span>
                  </div>
                  {#if m.sub}
                    <div class="truncate font-mono text-[10px] text-bone-400">{m.sub}</div>
                  {/if}
                </div>

                {#if i < 9}
                  <kbd class="mt-0.5 rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[9.5px] tracking-normal text-bone-400">Ctrl+{i + 1}</kbd>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</div>
