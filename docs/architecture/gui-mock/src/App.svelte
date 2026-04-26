<script lang="ts">
  import ProjectBar from './lib/ProjectBar.svelte'
  import LeftNav from './lib/LeftNav.svelte'
  import Session from './lib/Session.svelte'
  import Inspector from './lib/Inspector.svelte'
  import TerminalTail from './lib/TerminalTail.svelte'
  import TerminalDrawer from './lib/TerminalDrawer.svelte'
  import SettingsPanel from './lib/SettingsPanel.svelte'
  import EmptyState from './lib/EmptyState.svelte'
  import CommandPalette from './lib/CommandPalette.svelte'
  import ComposerPopovers from './lib/composer/ComposerPopovers.svelte'
  import { ui } from './lib/state.svelte'

  function onKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      ui.togglePalette()
    } else if ((e.metaKey || e.ctrlKey) && e.key === '`') {
      e.preventDefault()
      ui.toggleTerminal()
    } else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault()
      ui.open('settings')
    } else if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
      e.preventDefault()
      ui.toggleLeft()
    } else if ((e.metaKey || e.ctrlKey) && e.key === '.') {
      e.preventDefault()
      ui.toggleRight()
    } else if (e.key === 'Escape') {
      if (ui.paletteOpen) ui.paletteOpen = false
      else if (ui.terminalOpen) ui.terminalOpen = false
      else if (ui.diffPath) ui.closeDiff()
    }
  }

  type Side = 'left' | 'right'
  let dragging = $state<Side | null>(null)

  function startDrag(side: Side, e: PointerEvent) {
    e.preventDefault()
    dragging = side
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
  }

  function onDrag(e: PointerEvent) {
    if (!dragging) return
    if (dragging === 'left') {
      ui.setLeftWidth(e.clientX)
    } else {
      ui.setRightWidth(window.innerWidth - e.clientX)
    }
  }

  function endDrag(e: PointerEvent) {
    if (!dragging) return
    const target = e.currentTarget as HTMLElement
    if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId)
    dragging = null
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="flex h-screen w-screen flex-col overflow-hidden bg-ink-950 text-bone-100">
  <ProjectBar />

  <div class="flex min-h-0 flex-1">
    {#if ui.leftOpen}
      <aside
        class="relative min-h-0 shrink-0 overflow-hidden border-r border-ink-500"
        style="width: {ui.leftWidth}px"
      >
        <LeftNav />
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize left sidebar"
          onpointerdown={(e) => startDrag('left', e)}
          onpointermove={onDrag}
          onpointerup={endDrag}
          onpointercancel={endDrag}
          class="absolute inset-y-0 right-0 w-1 cursor-col-resize transition hover:bg-gold-deep {dragging === 'left' ? 'bg-gold-soft' : ''}"
        ></div>
      </aside>
    {/if}

    <main class="relative min-h-0 flex-1 overflow-hidden">
      {#if ui.view === 'session'}
        <Session />
      {:else if ui.view === 'settings'}
        <SettingsPanel />
      {:else}
        <EmptyState />
      {/if}
    </main>

    {#if ui.rightOpen}
      <aside
        class="relative min-h-0 shrink-0 overflow-hidden border-l border-ink-500"
        style="width: {ui.rightWidth}px"
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize right inspector"
          onpointerdown={(e) => startDrag('right', e)}
          onpointermove={onDrag}
          onpointerup={endDrag}
          onpointercancel={endDrag}
          class="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize transition hover:bg-gold-deep {dragging === 'right' ? 'bg-gold-soft' : ''}"
        ></div>
        <Inspector />
      </aside>
    {/if}
  </div>

  {#if ui.terminalOpen}
    <TerminalDrawer />
  {/if}
  <TerminalTail />
</div>

{#if ui.paletteOpen}
  <CommandPalette />
{/if}

<ComposerPopovers />
