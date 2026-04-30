<script lang="ts">
	import type { AppEvent } from "@daedalus-pi/app-server-protocol";
	import TranscriptTimeline from "../TranscriptTimeline.svelte";

	const { events, sessionId } = $props<{ events: readonly AppEvent[]; sessionId?: string }>();
</script>

<section class="space-y-3" data-testid="audit-timeline" aria-label="Audit event ledger">
	<div>
		<h3 class="caps text-bone-200">audit ledger</h3>
		<p class="mt-1 text-[11px] leading-5 text-bone-400">
			Raw event transcript for selected Thread diagnostics. This debug surface is intentionally separate from the active chat.
		</p>
	</div>
	<TranscriptTimeline {events} {sessionId} />
</section>
