<script lang="ts">
  import { ui } from './state.svelte'

  type Project = {
    label: string
    lastActivity: string
    liveSessions: number
    active?: boolean
    muted?: boolean
  }
  type SessionMark = 'running' | 'awaiting' | 'paused' | 'archived'
  type Session = {
    label: string
    branch: string
    base?: boolean
    active?: boolean
    mark: SessionMark
  }

  const projects: Project[] = [
    { label: 'Daedalus',         lastActivity: '2h',        liveSessions: 2, active: true },
    { label: 'gui-inspiration',  lastActivity: 'yesterday', liveSessions: 0 },
    { label: 'reasoning-bench',  lastActivity: 'Apr 22',    liveSessions: 0, muted: true },
  ]

  // Jean rule: one worktree per session.
  // Base session sits at the top; the rest are drag-to-reorder.
  const sessions: Session[] = [
    { label: 'main',                         branch: 'main',                       base: true,                  mark: 'paused'   },
    { label: 'ApprovalCard · narrow-width',  branch: 'fix/approval-card-wrap',                    active: true, mark: 'awaiting' },
    { label: 'CLI parity review',            branch: 'spike/cli-parity',                                        mark: 'running'  },
    { label: 'Provider cleanup',             branch: 'archive/provider-cleanup',                                mark: 'archived' },
  ]

  type Section = 'projects' | 'sessions'
  let open = $state<Record<Section, boolean>>({ projects: true, sessions: true })
  const counts: Record<Section, string> = {
    projects: '03',
    sessions: '04',
  }
  function toggle(s: Section) { open[s] = !open[s] }

  const activeProject = $derived(projects.find(p => p.active) ?? projects[0])
</script>

{#snippet header(s: Section, label: string)}
  <button
    type="button"
    onclick={() => toggle(s)}
    aria-expanded={open[s]}
    class="group flex w-full items-center justify-between py-3 text-left transition hover:text-bone-50"
  >
    <span class="label-caps text-bone-300 group-hover:text-bone-100">{label}</span>
    <span class="flex items-center gap-3">
      <span class="font-mono text-[10px] text-bone-400">{counts[s]}</span>
      <span
        class="inline-block w-2 text-center font-mono text-[11px] leading-none text-bone-400 transition-transform duration-150 {open[s]
          ? 'rotate-90'
          : ''}"
        aria-hidden="true"
      >
        ›
      </span>
    </span>
  </button>
{/snippet}

<div class="flex h-full flex-col">
  <div class="min-h-0 flex-1 overflow-y-auto px-5 text-[12.5px]">

    <section class="border-b border-ink-500">
      {@render header('projects', 'projects')}
      {#if open.projects}
        <ul class="space-y-0.5 pb-4">
          {#each projects as p}
            <li>
              <button
                class="group grid w-full grid-cols-[1fr_auto] items-baseline gap-x-3 py-1 text-left transition {p.active
                  ? 'text-bone-50'
                  : p.muted
                    ? 'text-bone-400 hover:text-bone-200'
                    : 'text-bone-200 hover:text-bone-50'}"
              >
                <span class="flex min-w-0 items-baseline gap-2">
                  <span class="truncate text-[13px] {p.active ? 'font-medium text-bone-50' : ''}">{p.label}</span>
                  {#if p.liveSessions > 0}
                    <span
                      class="inline-block h-1 w-1 shrink-0 translate-y-[-1px] rounded-full bg-gold"
                      aria-label="{p.liveSessions} live session{p.liveSessions === 1 ? '' : 's'}"
                    ></span>
                  {/if}
                </span>
                <span class="font-mono text-[10px] text-bone-400 tabular-nums">{p.lastActivity}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section>
      {@render header('sessions', `${activeProject.label} · sessions`)}
      {#if open.sessions}
        <ul class="space-y-1 pb-4">
          {#each sessions as s}
            <li>
              <button
                onclick={() => ui.open(s.mark === 'archived' ? 'empty' : 'session')}
                class="group grid w-full grid-cols-[10px_1fr_auto] items-baseline gap-x-3 py-1 text-left {s.active && ui.view === 'session'
                  ? 'text-bone-50'
                  : s.mark === 'archived'
                    ? 'text-bone-400 hover:text-bone-200'
                    : 'text-bone-200 hover:text-bone-50'}"
                title={s.mark}
              >
                {#if s.mark === 'awaiting'}
                  <span
                    class="mt-[5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full border border-gold bg-transparent"
                    aria-label="awaiting input"
                  ></span>
                {:else if s.mark === 'running'}
                  <span
                    class="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-gold"
                    aria-label="running"
                  ></span>
                {:else if s.mark === 'paused'}
                  <span
                    class="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-bone-300"
                    aria-label="paused"
                  ></span>
                {:else}
                  <span
                    class="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-bone-500"
                    aria-label="archived"
                  ></span>
                {/if}
                <div class="min-w-0">
                  <div class="truncate text-[12.5px] {s.active ? 'font-medium' : ''}">{s.label}</div>
                  <div class="truncate font-mono text-[10px] text-bone-400">{s.branch}</div>
                </div>
                {#if s.base}
                  <span class="caps shrink-0 text-gold-soft">base</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

  </div>

  <footer class="border-t border-ink-500">
    <button
      type="button"
      onclick={() => ui.open('settings')}
      class="flex w-full items-center justify-between border-b border-ink-500 px-5 py-2.5 text-left caps {ui.view === 'settings' ? 'text-gold' : 'text-bone-400 hover:text-bone-100'}"
    >
      <span>settings</span>
      <span class="font-mono text-[10px] tracking-normal text-bone-500">Super+,</span>
    </button>
    <div class="flex">
      <button class="flex-1 px-5 py-2.5 text-left caps text-bone-400 transition hover:text-bone-100">
        + new
      </button>
      <button class="flex-1 border-l border-ink-500 px-5 py-2.5 text-left caps text-bone-400 transition hover:text-bone-100">
        archived
      </button>
    </div>
  </footer>
</div>
