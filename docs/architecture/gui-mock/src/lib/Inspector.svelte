<script lang="ts">
  import { ui } from './state.svelte'

  type PlanStep = { label: string; sub: string; status: 'done' | 'active' | 'next' }
  const planSteps: PlanStep[] = [
    { label: 'Reproduce wrap at 480px', sub: 'snapshot · ApprovalCard.test.ts', status: 'done' },
    { label: 'Tighten button row layout', sub: 'flex-wrap nowrap', status: 'active' },
    { label: 'Update snapshot & commit', sub: 'pnpm test --update-snapshot', status: 'next' },
  ]

  type Approval = { what: string; why: string; status: 'blocked' | 'allowed' | 'required' }
  const approvals: Approval[] = [
    { what: 'Snapshot update', why: 'pnpm test --update-snapshot', status: 'blocked' },
    { what: 'Component edits', why: 'packages/gui/src/components/**', status: 'allowed' },
    { what: 'Commit & push', why: 'requires explicit approval', status: 'required' },
  ]

  const diff = [
    { path: 'ApprovalCard.svelte', sub: 'layout · dark-mode hatch', add: 18, rem: 6 },
    { path: '__snapshots__/ApprovalCard.test.ts.snap', sub: 'pending', add: 0, rem: 0 },
  ]

  const subagents = [
    { role: 'Planner', what: 'holds the thread' },
    { role: 'Linter', what: 'a11y & tokens' },
    { role: 'Builder', what: 'edits ApprovalCard' },
  ]

  type Section = 'plan' | 'approvals' | 'diff' | 'subagents'
  let open = $state<Record<Section, boolean>>({
    plan: true,
    approvals: true,
    diff: true,
    subagents: true,
  })

  const counts: Record<Section, string> = {
    plan: '1 / 3',
    approvals: '02',
    diff: '1 new',
    subagents: '3',
  }

  function toggle(s: Section) {
    open[s] = !open[s]
  }
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

<div class="flex h-full flex-col overflow-y-auto px-6 text-[12.5px]">

  <section class="border-b border-ink-500">
    {@render header('plan', 'plan')}
    {#if open.plan}
      <ol class="space-y-3 pb-5">
        {#each planSteps as s}
          <li class="grid grid-cols-[14px_1fr] gap-x-3">
            <span
              class="mt-[7px] inline-block h-1 w-1 rounded-full {s.status === 'done'
                ? 'bg-bone-400'
                : s.status === 'active'
                  ? 'bg-gold'
                  : 'bg-bone-500'}"
            ></span>
            <div>
              <div class="{s.status === 'done' ? 'text-bone-400 line-through' : s.status === 'active' ? 'text-bone-50 font-medium' : 'text-bone-200'}">
                {s.label}
              </div>
              <div class="font-mono text-[10px] text-bone-400">{s.sub}</div>
            </div>
          </li>
        {/each}
      </ol>
    {/if}
  </section>

  <section class="border-b border-ink-500">
    {@render header('approvals', 'approvals')}
    {#if open.approvals}
      <ul class="space-y-3 pb-5">
        {#each approvals as a}
          <li class="flex items-baseline justify-between gap-4">
            <div class="min-w-0">
              <div class="text-bone-100">{a.what}</div>
              <div class="font-mono text-[10px] text-bone-400">{a.why}</div>
            </div>
            <span
              class="caps shrink-0 {a.status === 'blocked'
                ? 'text-gold'
                : a.status === 'allowed'
                  ? 'text-bone-300'
                  : 'text-bone-400'}"
            >
              {a.status}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="border-b border-ink-500">
    {@render header('diff', 'diff')}
    {#if open.diff}
      <ul class="space-y-1 pb-5">
        {#each diff as d}
          <li>
            <button
              type="button"
              onclick={() => ui.openDiff(d.path)}
              class="group flex w-full items-baseline justify-between gap-4 py-1 text-left font-mono text-[11px] transition hover:text-bone-50"
            >
              <div class="min-w-0">
                <div class="truncate text-bone-100 group-hover:text-gold">{d.path}</div>
                <div class="text-[10px] text-bone-400">{d.sub}</div>
              </div>
              <span class="shrink-0 tabular-nums text-bone-300">
                +{d.add} &nbsp;−{d.rem}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    {@render header('subagents', 'subagents')}
    {#if open.subagents}
      <ul class="space-y-2 pb-5">
        {#each subagents as a}
          <li class="flex items-baseline gap-3">
            <span class="text-[12.5px] font-medium text-bone-50">{a.role}</span>
            <span class="text-[11px] text-bone-400">— {a.what}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
