<script lang="ts">
	import type { TranscriptItem } from "../../client/view-model";
	const { item } = $props<{ item: Readonly<TranscriptItem> }>();
</script>

<div class="rounded-md border border-gold/30 bg-gold/5 p-3 text-bone-300">
	<div class="caps text-gold">{item.title}</div>
	<p class="mt-1 whitespace-pre-wrap">{item.summary}</p>
</div>
