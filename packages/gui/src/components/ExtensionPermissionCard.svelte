<script lang="ts">
	const { permission } = $props<{ permission: string }>();
</script>
<div class="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">Permission required: {permission}</div>
