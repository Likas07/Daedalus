<script lang="ts">
	import type { ProviderStatus } from "../client/view-model";

	const { provider, onLogin, onLogout } = $props<{ provider: ProviderStatus; onLogin?: (provider: string) => void; onLogout?: (provider: string) => void }>();

	function statusToneClass(status: string, authenticated: boolean): string {
		if (status === "ready" || status === "env-key" || status === "oauth" || status === "ok" || authenticated) return "pill pill-green";
		if (status === "error" || status === "failed") return "pill pill-crimson";
		if (status === "unknown") return "pill";
		return "pill pill-blue";
	}

	function disabledReason(action: "login" | "relogin" | "logout"): string | undefined {
		if (action === "login" && provider.canLogin) return undefined;
		if (action === "relogin" && provider.canRelogin) return undefined;
		if (action === "logout" && provider.canLogout) return undefined;
		return provider.instruction ?? provider.message ?? "Not actionable for this provider.";
	}
</script>

<div class="rounded-md border border-[color:var(--rule)] bg-[color:var(--ink-3)] p-4" data-testid="provider-status-row">
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<div class="flex items-center gap-2">
				<span aria-hidden="true" class="font-display text-[16px] italic text-[color:var(--brass)]">¶</span>
				<h4 class="text-[14px] font-medium text-[color:var(--bone)]">{provider.provider}</h4>
			</div>
			<p class="mt-1 font-mono text-[10.5px] text-[color:var(--bone-faint)]">
				Auth: <span class={provider.authenticated ? "text-[color:var(--verdigris)]" : "text-[color:var(--bone-soft)]"}>
					{provider.authenticated ? "authenticated" : "not authenticated"}
				</span>
				<span aria-hidden="true" class="mx-1 text-[color:var(--rule-strong)]">·</span>
				Status: <span class="text-[color:var(--bone-soft)]">{provider.status}</span>
			</p>
			{#if provider.instruction || provider.message}
				<p class="mt-2 font-mono text-[10.5px] text-[color:var(--bone-faint)]">{provider.message ?? provider.instruction}</p>
			{/if}
		</div>
		<span class={statusToneClass(provider.status, provider.authenticated)}>
			<span class="text-[color:var(--bone-faint)]">models</span>
			<span class="tnum">{provider.modelCount ?? "Model count pending"}</span>
		</span>
	</div>

	<dl class="mt-4 grid gap-2 border-t border-[color:var(--rule)] pt-3 font-mono text-[10.5px] sm:grid-cols-3">
		<div>
			<dt class="text-[color:var(--bone-faint)] uppercase tracking-[0.14em] text-[9.5px]">method</dt>
			<dd class="mt-0.5 text-[color:var(--bone-soft)]">{provider.authMethod ?? "pending protocol data"}</dd>
		</div>
		<div>
			<dt class="text-[color:var(--bone-faint)] uppercase tracking-[0.14em] text-[9.5px]">source</dt>
			<dd class="mt-0.5 text-[color:var(--bone-soft)]">{provider.source ?? "pending protocol data"}</dd>
		</div>
		<div>
			<dt class="text-[color:var(--bone-faint)] uppercase tracking-[0.14em] text-[9.5px]">action</dt>
			<dd class="mt-0.5 text-[color:var(--bone-soft)]">{provider.actionable ? "available" : "not actionable"}</dd>
		</div>
	</dl>

	<div class="mt-4 flex flex-wrap gap-2">
		<button disabled={!provider.canLogin || !onLogin} title={disabledReason("login")} onclick={() => onLogin?.(provider.provider)} class="btn-mini" type="button">Login</button>
		<button disabled={!provider.canRelogin || !onLogin} title={disabledReason("relogin")} onclick={() => onLogin?.(provider.provider)} class="btn-mini" type="button">Relogin</button>
		<button disabled={!provider.canLogout || !onLogout} title={disabledReason("logout")} onclick={() => onLogout?.(provider.provider)} class="btn-mini" type="button">Logout</button>
	</div>
</div>
