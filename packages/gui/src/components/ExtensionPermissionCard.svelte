<script lang="ts">
	const { permission } = $props<{ permission: string }>();
</script>

<div class="flex items-center gap-2 rounded-sm border border-[color:var(--ember)]/40 bg-[color:var(--ember)]/8 px-2 py-1.5 font-mono text-[10.5px] text-[color:var(--ember)]">
	<span aria-hidden="true" class="grid size-4 place-items-center rounded-full border border-[color:var(--ember)] font-display text-[9px] italic">!</span>
	<span class="flex-1">
		<span class="text-[color:var(--bone-faint)]">requires</span>
		<span class="ml-1.5 text-[color:var(--bone)]">{permission}</span>
	</span>
</div>
