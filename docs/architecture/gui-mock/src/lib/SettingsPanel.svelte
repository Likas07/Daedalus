<script lang="ts">
  import { ui } from './state.svelte'

  type Section = 'providers' | 'appearance' | 'keybindings' | 'integrations' | 'extensions'
  let active = $state<Section>('providers')

  const sections: Array<{ id: Section; label: string; sub: string }> = [
    { id: 'providers',    label: 'Providers',    sub: 'API keys, default model' },
    { id: 'appearance',   label: 'Appearance',   sub: 'theme, density, fonts' },
    { id: 'keybindings',  label: 'Keybindings',  sub: 'global shortcuts' },
    { id: 'integrations', label: 'Integrations', sub: 'GitHub, Linear, Slack' },
    { id: 'extensions',   label: 'Extensions',   sub: 'installed packages' },
  ]

  const providers = [
    { name: 'Anthropic', model: 'claude-opus-4-7', key: 'sk-ant-····················7k2', enabled: true },
    { name: 'OpenAI',    model: 'gpt-5',          key: 'sk-····················9af',    enabled: true },
    { name: 'Google',    model: 'gemini-2.5-pro', key: '— not configured —',            enabled: false },
    { name: 'Local',     model: 'llama-3.1-70b',  key: 'http://localhost:11434',        enabled: false },
  ]

  const integrations = [
    { name: 'GitHub', status: 'connected', detail: '@Likas07 · 8 repos · push allowed' },
    { name: 'Linear', status: 'connected', detail: 'STG team · 14 active issues' },
    { name: 'Slack',  status: 'idle',      detail: 'not configured' },
  ]

  const extensions = [
    { name: 'daedalus-coding-agent',     version: '0.1.0', status: 'active'  },
    { name: 'daedalus-app-server',       version: '0.1.0', status: 'active'  },
    { name: 'daedalus-extension-runner', version: '0.0.7', status: 'idle'    },
  ]

  const keybindings = [
    { action: 'Open command palette', combo: 'Super+K' },
    { action: 'New session',          combo: 'Super+N' },
    { action: 'Toggle terminal',      combo: 'Super+`' },
    { action: 'Approve & continue',   combo: 'Super+↵' },
    { action: 'Approve · yolo',       combo: 'Super+Y' },
    { action: 'Cancel approval',      combo: 'Esc' },
    { action: 'Switch worktree',      combo: 'Super+Shift+W' },
    { action: 'Open settings',        combo: 'Super+,' },
  ]
</script>

<div class="flex h-full">
  <!-- Settings sub-nav -->
  <nav class="w-[220px] shrink-0 border-r border-ink-500 px-5 py-8">
    <div class="mb-6 flex items-baseline gap-2">
      <button
        type="button"
        onclick={() => ui.open('session')}
        class="caps text-bone-400 transition hover:text-bone-100"
      >
        ‹ back
      </button>
    </div>

    <h2 class="label-caps mb-4">settings</h2>
    <ul class="space-y-0.5">
      {#each sections as s}
        <li>
          <button
            type="button"
            onclick={() => (active = s.id)}
            class="block w-full py-1.5 text-left transition {active === s.id ? 'text-bone-50' : 'text-bone-300 hover:text-bone-100'}"
          >
            <div class="text-[13px] {active === s.id ? 'font-medium' : ''}">{s.label}</div>
            <div class="font-mono text-[10px] text-bone-400">{s.sub}</div>
          </button>
        </li>
      {/each}
    </ul>
  </nav>

  <!-- Pane -->
  <div class="min-w-0 flex-1 overflow-y-auto px-12 py-10">
    <div class="mx-auto max-w-[68ch]">

      {#if active === 'providers'}
        <header class="mb-8">
          <h1 class="text-[20px] font-medium text-bone-50">Providers</h1>
          <p class="mt-1 text-[13px] text-bone-300">
            Model providers used for chat and tool calls. Daedalus prefers the first
            healthy provider in this list.
          </p>
        </header>

        <ul class="divide-y divide-ink-500 border-y border-ink-500">
          {#each providers as p}
            <li class="grid grid-cols-[160px_1fr_120px] items-center gap-6 py-4">
              <div>
                <div class="text-[13px] font-medium text-bone-50">{p.name}</div>
                <div class="font-mono text-[10.5px] text-bone-400">{p.model}</div>
              </div>
              <div class="font-mono text-[11.5px] text-bone-300">{p.key}</div>
              <div class="text-right">
                <span class="caps {p.enabled ? 'text-gold' : 'text-bone-400'}">
                  {p.enabled ? 'enabled' : 'off'}
                </span>
              </div>
            </li>
          {/each}
        </ul>

        <button
          type="button"
          class="mt-6 caps border border-ink-400 px-4 py-2 text-bone-200 transition hover:border-gold hover:text-gold"
        >
          + add provider
        </button>
      {/if}

      {#if active === 'appearance'}
        <header class="mb-8">
          <h1 class="text-[20px] font-medium text-bone-50">Appearance</h1>
          <p class="mt-1 text-[13px] text-bone-300">
            Daedalus runs only in dark mode for now.
          </p>
        </header>

        <dl class="divide-y divide-ink-500 border-y border-ink-500">
          {#each [
            { k: 'Theme',   v: 'Obsidian',   sub: 'gold accents · dark only' },
            { k: 'Density', v: 'Comfortable', sub: 'compact · comfortable · spacious' },
            { k: 'Display font', v: 'Inter',  sub: 'Cinzel reserved for the wordmark' },
            { k: 'Mono font',   v: 'JetBrains Mono', sub: 'used in code, paths, numbers' },
            { k: 'Animations',  v: 'Reduced', sub: 'no decorative motion; transitions only' },
          ] as row}
            <div class="grid grid-cols-[180px_1fr_120px] items-center gap-6 py-4">
              <dt class="text-[13px] text-bone-100">{row.k}</dt>
              <dd class="text-[13px] text-bone-300">
                {row.v}
                <span class="ml-3 font-mono text-[10.5px] text-bone-400">{row.sub}</span>
              </dd>
              <div class="text-right">
                <button class="caps text-bone-400 transition hover:text-bone-100">change</button>
              </div>
            </div>
          {/each}
        </dl>
      {/if}

      {#if active === 'keybindings'}
        <header class="mb-8">
          <h1 class="text-[20px] font-medium text-bone-50">Keybindings</h1>
          <p class="mt-1 text-[13px] text-bone-300">Global shortcuts. Click a row to rebind.</p>
        </header>

        <ul class="divide-y divide-ink-500 border-y border-ink-500">
          {#each keybindings as kb}
            <li class="flex items-baseline justify-between gap-6 py-3">
              <span class="text-[13px] text-bone-100">{kb.action}</span>
              <kbd class="rounded-sm border border-ink-500 px-2 py-0.5 font-mono text-[11px] text-bone-200">{kb.combo}</kbd>
            </li>
          {/each}
        </ul>
      {/if}

      {#if active === 'integrations'}
        <header class="mb-8">
          <h1 class="text-[20px] font-medium text-bone-50">Integrations</h1>
          <p class="mt-1 text-[13px] text-bone-300">External services Daedalus can read from or post to.</p>
        </header>

        <ul class="divide-y divide-ink-500 border-y border-ink-500">
          {#each integrations as i}
            <li class="grid grid-cols-[160px_1fr_120px] items-center gap-6 py-4">
              <div class="text-[13px] font-medium text-bone-50">{i.name}</div>
              <div class="font-mono text-[11px] text-bone-300">{i.detail}</div>
              <div class="text-right">
                <span class="caps {i.status === 'connected' ? 'text-gold' : 'text-bone-400'}">{i.status}</span>
              </div>
            </li>
          {/each}
        </ul>
      {/if}

      {#if active === 'extensions'}
        <header class="mb-8">
          <h1 class="text-[20px] font-medium text-bone-50">Extensions</h1>
          <p class="mt-1 text-[13px] text-bone-300">Installed Daedalus extensions and runtime backends.</p>
        </header>

        <ul class="divide-y divide-ink-500 border-y border-ink-500">
          {#each extensions as e}
            <li class="grid grid-cols-[1fr_100px_120px] items-center gap-6 py-4">
              <div class="font-mono text-[12.5px] text-bone-100">{e.name}</div>
              <div class="font-mono text-[11px] text-bone-400">{e.version}</div>
              <div class="text-right">
                <span class="caps {e.status === 'active' ? 'text-gold' : 'text-bone-400'}">{e.status}</span>
              </div>
            </li>
          {/each}
        </ul>
      {/if}

    </div>
  </div>
</div>
