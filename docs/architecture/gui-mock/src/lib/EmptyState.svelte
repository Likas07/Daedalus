<script lang="ts">
  import { ui } from './state.svelte'
</script>

<div class="flex h-full flex-col items-center justify-center gap-6 px-10 text-center">
  <div class="font-wordmark text-[20px] font-medium tracking-[0.32em] text-bone-300">
    DAEDALUS
  </div>

  <p class="max-w-[40ch] text-[14px] leading-[1.7] text-bone-200">
    Pick a session to continue,
    <button
      type="button"
      onclick={() => ui.togglePalette()}
      class="text-gold underline-offset-4 transition hover:underline"
    >
      open the palette
    </button>
    , or
    <button
      type="button"
      onclick={() => ui.open('session')}
      class="text-gold underline-offset-4 transition hover:underline"
    >
      start a new one
    </button>
    .
  </p>

  <div class="mt-4 flex items-center gap-6 caps text-bone-400">
    <span class="flex items-center gap-2">
      <kbd class="rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[10px] tracking-normal text-bone-300">Super+K</kbd>
      command palette
    </span>
    <span class="flex items-center gap-2">
      <kbd class="rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[10px] tracking-normal text-bone-300">Super+N</kbd>
      new session
    </span>
  </div>
</div>
