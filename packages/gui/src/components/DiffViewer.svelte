<script lang="ts">
	const { patch = "" } = $props<{ patch?: string }>();
</script>
<section class="rounded-xl border border-zinc-800 bg-black/60">
	<header class="border-b border-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-200">Diff</header>
	<pre class="max-h-96 overflow-auto p-3 text-xs leading-relaxed text-zinc-300">{patch || 'No patch selected.'}</pre>
</section>
