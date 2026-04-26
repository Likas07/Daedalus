<script lang="ts">
	import type { TranscriptItem } from "../../client/view-model";
	const { item } = $props<{ item: Readonly<TranscriptItem> }>();
</script>

<div class="rounded-md border border-ink-500 bg-black/30 p-3 font-mono text-[11px] text-green-200">
	<div class="caps text-bone-400">bash</div>
	<pre class="mt-2 whitespace-pre-wrap">{item.summary}</pre>
</div>
