<script lang="ts">
  let checked = $state(true)
</script>

<section class="border-l border-gold pl-5">
  <header class="mb-2 flex items-baseline gap-3">
    <h3 class="text-[13px] font-medium text-bone-50">Permission required</h3>
    <span class="caps text-bone-400">1 tool blocked</span>
  </header>

  <p class="mb-4 max-w-[60ch] text-[13px] text-bone-200">
    Daedalus wants to run the dark-mode contrast check before committing.
  </p>

  <label class="mb-5 flex items-start gap-3">
    <input type="checkbox" bind:checked class="peer sr-only" />
    <span
      class="mt-[3px] flex h-3 w-3 shrink-0 items-center justify-center border border-bone-300 transition peer-checked:border-gold peer-checked:bg-gold"
      aria-hidden="true"
    >
      {#if checked}
        <svg viewBox="0 0 8 8" class="h-2 w-2 text-ink-950" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 4l2 2 4-4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      {/if}
    </span>
    <span class="min-w-0 flex-1">
      <code class="block font-mono text-[12px] text-bone-100">
        pnpm --filter gui test -- --update-snapshot ApprovalCard
      </code>
      <span class="mt-1 block font-mono text-[10px] text-bone-400">
        bash · component snapshot
      </span>
    </span>
  </label>

  <div class="flex items-center gap-5">
    <button
      type="button"
      class="caps border border-gold px-4 py-1.5 text-gold transition hover:bg-gold hover:text-ink-950"
    >
      approve
      <span class="ml-2 font-mono text-[10px] tracking-normal opacity-70">Super+↵</span>
    </button>
    <button
      type="button"
      class="caps text-bone-300 transition hover:text-bone-50"
    >
      yolo
      <span class="ml-2 font-mono text-[10px] tracking-normal opacity-70">Super+Y</span>
    </button>
    <button
      type="button"
      class="caps ml-auto text-bone-400 transition hover:text-bone-100"
    >
      cancel
    </button>
  </div>
</section>
