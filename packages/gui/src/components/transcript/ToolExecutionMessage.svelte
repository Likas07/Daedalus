<script lang="ts">
	import type { TranscriptItem } from "../../client/view-model";
	const { item } = $props<{ item: Readonly<TranscriptItem> }>();
</script>

<div class="rounded-md border border-ink-500 bg-ink-900/60 p-3 font-mono text-[11px] text-bone-300">
	<div class="caps text-gold">{item.title}</div>
	<pre class="mt-2 whitespace-pre-wrap">{item.summary}</pre>
</div>
