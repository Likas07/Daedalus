<script lang="ts">
	import type { TranscriptItem } from "../../client/view-model";
	const { item } = $props<{ item: Readonly<TranscriptItem> }>();
</script>

<div class="space-y-2">
	<p class="whitespace-pre-wrap leading-6 text-bone-100">{item.summary}</p>
</div>
