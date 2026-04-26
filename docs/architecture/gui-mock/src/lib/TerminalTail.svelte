<script lang="ts">
  import { ui } from './state.svelte'
</script>

<footer
  class="flex h-7 shrink-0 items-center gap-4 border-t border-ink-500 px-5 font-mono text-[10.5px] text-bone-400"
>
  <span class="text-bone-300">$</span>
  <span class="truncate">
    pnpm --filter gui dev
    <span class="text-bone-500"> · </span>
    <span class="text-bone-300">ready in 421 ms</span>
  </span>
  <span class="ml-auto shrink-0 text-bone-500">~/Research/Daedalus</span>
  <button
    type="button"
    onclick={() => ui.toggleTerminal()}
    class="caps transition hover:text-bone-100"
  >
    {ui.terminalOpen ? 'collapse' : 'expand'}
    <span class="ml-2 text-[10px] tracking-normal text-bone-500">Super+`</span>
  </button>
</footer>
