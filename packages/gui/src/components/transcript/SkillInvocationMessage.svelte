<script lang="ts">
	import type { TranscriptItem } from "../../client/view-model";
	const { item } = $props<{ item: Readonly<TranscriptItem> }>();
</script>

<div class="rounded-md border border-blue-400/30 bg-blue-400/5 p-3 text-bone-300">
	<div class="caps text-blue-200">skill invocation</div>
	<p class="mt-1 whitespace-pre-wrap">{item.summary || item.title}</p>
</div>
