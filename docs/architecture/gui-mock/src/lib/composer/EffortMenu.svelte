<script lang="ts">
  import { ui, type Effort, type FastMode } from '../state.svelte'

  type EffortItem = { id: Effort; label: string; isDefault?: boolean }
  const efforts: EffortItem[] = [
    { id: 'low',        label: 'Low' },
    { id: 'medium',     label: 'Medium' },
    { id: 'high',       label: 'High', isDefault: true },
    { id: 'max',        label: 'Max' },
    { id: 'ultrathink', label: 'Ultrathink' },
  ]

  type WindowItem = { value: number; label: string; isDefault?: boolean }
  const windows: WindowItem[] = [
    { value: 200_000,   label: '200k', isDefault: true },
    { value: 1_000_000, label: '1M' },
  ]

  const fasts: { id: FastMode; label: string }[] = [
    { id: 'on',  label: 'On' },
    { id: 'off', label: 'Off' },
  ]
</script>

{#snippet sectionLabel(text: string)}
  <div class="px-3 pb-1 pt-2 caps text-bone-400">{text}</div>
{/snippet}

{#snippet checkRow(active: boolean, label: string, sub: string | null, onclick: () => void)}
  <button
    type="button"
    {onclick}
    class="grid w-full grid-cols-[14px_1fr] items-baseline gap-2 px-3 py-1 text-left transition hover:bg-ink-850 {active ? 'text-bone-50' : 'text-bone-200'}"
  >
    <span class="text-[11px] {active ? 'text-gold' : 'text-transparent'}" aria-hidden="true">✓</span>
    <span class="min-w-0 truncate text-[12.5px] {active ? 'font-medium' : ''}">
      {label}{#if sub}<span class="ml-1 font-mono text-[10px] text-bone-400">({sub})</span>{/if}
    </span>
  </button>
{/snippet}

<div class="flex h-full min-h-0 flex-col">
  <div class="min-h-0 flex-1 overflow-y-auto py-1">

    <!-- Reasoning -->
    {@render sectionLabel('reasoning')}
    <ul>
      {#each efforts as e}
        <li>{@render checkRow(ui.effort === e.id, e.label, e.isDefault ? 'default' : null, () => (ui.effort = e.id))}</li>
      {/each}
    </ul>

    <div class="my-1 h-px bg-ink-500"></div>

    <!-- Context Window -->
    {@render sectionLabel('context window')}
    <ul>
      {#each windows as w}
        <li>{@render checkRow(ui.contextWindow === w.value, w.label, w.isDefault ? 'default' : null, () => (ui.contextWindow = w.value))}</li>
      {/each}
    </ul>

    <div class="my-1 h-px bg-ink-500"></div>

    <!-- Fast Mode -->
    {@render sectionLabel('fast mode')}
    <ul>
      {#each fasts as f}
        <li>{@render checkRow(ui.fastMode === f.id, f.label, null, () => (ui.fastMode = f.id))}</li>
      {/each}
    </ul>

  </div>
</div>
