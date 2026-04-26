<script lang="ts">
	import type { TranscriptItem } from "../../client/view-model";
	const { item } = $props<{ item: Readonly<TranscriptItem> }>();
</script>

<p class="whitespace-pre-wrap rounded-md bg-ink-850/70 px-3 py-2 leading-6 text-bone-100">{item.summary}</p>
