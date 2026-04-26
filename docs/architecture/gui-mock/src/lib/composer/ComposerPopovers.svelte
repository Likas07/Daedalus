<script lang="ts">
  import { ui } from '../state.svelte'
  import ModelPicker from './ModelPicker.svelte'
  import EffortMenu from './EffortMenu.svelte'
  import ModeMenu from './ModeMenu.svelte'
  import AccessMenu from './AccessMenu.svelte'

  // Popover positions itself above the chip, left-aligned to it.
  const sizeFor = (kind: typeof ui.popoverKind): { w: number; h: number } => {
    if (kind === 'model')  return { w: 420, h: 420 }
    if (kind === 'effort') return { w: 280, h: 360 }
    if (kind === 'mode')   return { w: 280, h: 220 }
    if (kind === 'access') return { w: 300, h: 220 }
    return { w: 0, h: 0 }
  }

  const style = $derived.by(() => {
    if (!ui.popoverKind || !ui.popoverAnchor) return ''
    const { w, h } = sizeFor(ui.popoverKind)
    const a = ui.popoverAnchor
    const margin = 8
    // Anchor the popover's bottom to the chip's top — content height defines the box.
    const bottom = Math.max(margin, window.innerHeight - a.top + margin)
    const maxH = Math.min(h, a.top - margin * 2)
    const left = Math.min(window.innerWidth - w - margin, Math.max(margin, a.left))
    return `position: fixed; bottom: ${bottom}px; left: ${left}px; width: ${w}px; max-height: ${maxH}px;`
  })

  function onBackdrop(e: MouseEvent) {
    e.stopPropagation()
    ui.closePopover()
  }
</script>

{#if ui.popoverKind}
  <div
    role="presentation"
    onclick={onBackdrop}
    onkeydown={(e) => e.key === 'Escape' && ui.closePopover()}
    class="fixed inset-0 z-40"
  ></div>

  <div
    role="dialog"
    aria-modal="true"
    style={style}
    class="z-50 flex flex-col overflow-hidden border border-ink-500 bg-ink-900 shadow-2xl shadow-black/40"
  >
    {#if ui.popoverKind === 'model'}
      <ModelPicker />
    {:else if ui.popoverKind === 'effort'}
      <EffortMenu />
    {:else if ui.popoverKind === 'mode'}
      <ModeMenu />
    {:else if ui.popoverKind === 'access'}
      <AccessMenu />
    {/if}
  </div>
{/if}
