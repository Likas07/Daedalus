<script lang="ts">
	import type { ProviderStatus } from "../client/view-model";

	const { provider } = $props<{ provider: ProviderStatus }>();
</script>

<div class="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3" data-testid="provider-status-row">
	<div class="flex items-start justify-between gap-3">
		<div>
			<h4 class="text-sm font-medium text-zinc-100">{provider.provider}</h4>
			<p class="mt-1 text-xs text-zinc-500">Auth: {provider.authenticated ? "authenticated" : "not authenticated"} · Status: {provider.status}</p>
		</div>
		<span class="rounded-full border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">{provider.modelCount ?? "Model count pending"}</span>
	</div>
	<div class="mt-3 grid gap-1 text-xs text-zinc-500 sm:grid-cols-3">
		<p>Version: {provider.version ?? "pending protocol data"}</p>
		<p>Source: {provider.source ?? "pending protocol data"}</p>
		<p>Path: pending protocol data</p>
	</div>
	<div class="mt-3 flex flex-wrap gap-2">
		<button disabled class="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-600">Login</button>
		<button disabled class="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-600">Relogin</button>
		<button disabled class="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-600">Install</button>
	</div>
</div>
