<script lang="ts">
	import { disabledReasonFor } from "../client/capability-registry";
	import type { GuiState } from "../client/runtime";
	import type { GuiRuntime } from "../client/runtime";
	import { createSettingsViewModel } from "../client/settings-view-model";
	import type { UiState } from "../client/ui-state.svelte";
	import { createResourcesViewModel, type ResourceItem } from "../client/resources-view-model";
	import ProviderStatusRow from "./ProviderStatusRow.svelte";
	import AutomationRulesPanel from "./AutomationRulesPanel.svelte";
	import ExtensionsManager from "./ExtensionsManager.svelte";

	type Section = "providers" | "appearance" | "keybindings" | "integrations" | "extensions" | "approvals" | "diagnostics";

	const { guiState, runtime, ui } = $props<{ guiState: GuiState; runtime?: GuiRuntime; ui?: UiState }>();
	let active = $state<Section>("providers");
	let resources = $state<ResourceItem[]>([]);
	let resourceDiagnostics = $state<string[]>([]);

	const sections: Array<{ id: Section; label: string; sub: string }> = [
		{ id: "providers", label: "Providers", sub: "API keys, default model" },
		{ id: "approvals", label: "Approvals", sub: "policy & automation" },
		{ id: "appearance", label: "Appearance", sub: "theme, density, fonts" },
		{ id: "keybindings", label: "Keybindings", sub: "global shortcuts" },
		{ id: "integrations", label: "Integrations", sub: "GitHub, Linear, Slack" },
		{ id: "extensions", label: "Extensions", sub: "installed packages" },
		{ id: "diagnostics", label: "Diagnostics", sub: "export logs & status" },
	];

	const settings = $derived(createSettingsViewModel(guiState.settings, guiState.authStatuses));
	const resourcesVm = $derived(createResourcesViewModel({ resources, diagnostics: resourceDiagnostics }));

	const appearanceRows = [
		{ k: "Theme", v: "Obsidian", sub: "gold accents · dark only" },
		{ k: "Density", v: "Comfortable", sub: "compact · comfortable · spacious" },
		{ k: "Display font", v: "Inter", sub: "Cinzel reserved for the wordmark" },
		{ k: "Mono font", v: "JetBrains Mono", sub: "used in code, paths, numbers" },
		{ k: "Animations", v: "Reduced", sub: "no decorative motion; transitions only" },
	];

	const keybindingsDisabledReason = disabledReasonFor("keybindings");
	const themesDisabledReason = disabledReasonFor("themes");
	const exportDisabledReason = disabledReasonFor("export");

	function backToSession(): void {
		if (ui) ui.view = guiState.selectedSessionId ? "session" : "empty";
	}

	function moveTab(delta: number): void {
		const index = sections.findIndex((section) => section.id === active);
		active = sections[(index + delta + sections.length) % sections.length].id;
	}

	function onTabKeydown(event: KeyboardEvent, section: Section): void {
		if (event.key === "ArrowDown" || event.key === "ArrowRight") {
			event.preventDefault();
			moveTab(1);
		} else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
			event.preventDefault();
			moveTab(-1);
		} else if (event.key === "Home") {
			event.preventDefault();
			active = sections[0].id;
		} else if (event.key === "End") {
			event.preventDefault();
			active = sections[sections.length - 1].id;
		} else if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			active = section;
		}
	}

	async function setSetting(key: string, value: unknown): Promise<void> {
		if (!runtime) return;
		guiState.settings = await runtime.client.setSetting({ scope: "global", key, value });
		runtime.notify();
	}

	async function resetSetting(key: string): Promise<void> {
		if (!runtime) return;
		guiState.settings = await runtime.client.resetSetting({ scope: "global", key });
		runtime.notify();
	}

	async function reloadResources(): Promise<void> {
		if (!runtime) return;
		guiState.settings = await runtime.client.reloadSettingsResources();
		const snapshot = await runtime.client.reloadResources();
		resources = [...(snapshot.resources as ResourceItem[])];
		resourceDiagnostics = [...snapshot.diagnostics];
		runtime.notify();
	}

	async function providerLogin(provider: string): Promise<void> {
		if (!runtime) return;
		await runtime.client.request("auth/login", { provider });
		const result = await runtime.client.request("auth/status", {});
		guiState.authStatuses = [...(result.providers ?? [])];
		guiState.providerStatuses = [...guiState.authStatuses];
		runtime.notify();
	}

	async function providerLogout(provider: string): Promise<void> {
		if (!runtime) return;
		await runtime.client.request("auth/logout", { provider });
		const result = await runtime.client.request("auth/status", {});
		guiState.authStatuses = [...(result.providers ?? [])];
		guiState.providerStatuses = [...guiState.authStatuses];
		runtime.notify();
	}
</script>

<div class="flex h-full" data-testid="settings-panel" role="region" aria-label="Settings">
	<!-- Settings sub-nav -->
	<nav class="w-[220px] shrink-0 border-r border-ink-500 px-5 py-8">
		<div class="mb-6 flex items-baseline gap-2">
			<button
				type="button"
				onclick={backToSession}
				class="caps text-bone-400 transition hover:text-bone-100"
			>‹ back</button>
		</div>

		<h2 class="caps mb-4 text-bone-300">settings</h2>
		<ul class="space-y-0.5" role="tablist" aria-label="Settings sections">
			{#each sections as section}
				<li>
					<button
						type="button"
						onclick={() => (active = section.id)}
						onkeydown={(event) => onTabKeydown(event, section.id)}
						role="tab"
						aria-selected={active === section.id}
						aria-controls={`settings-panel-${section.id}`}
						id={`settings-tab-${section.id}`}
						tabindex={active === section.id ? 0 : -1}
						class="block w-full py-1.5 text-left transition {active === section.id ? 'text-bone-50' : 'text-bone-300 hover:text-bone-100'}"
					>
						<div class="text-[13px] {active === section.id ? 'font-medium' : ''}">{section.label}</div>
						<div class="font-mono text-[10px] text-bone-400">{section.sub}</div>
					</button>
				</li>
			{/each}
		</ul>
	</nav>

	<!-- Pane -->
	<div class="min-w-0 flex-1 overflow-y-auto px-12 py-10" role="tabpanel" id={`settings-panel-${active}`} aria-labelledby={`settings-tab-${active}`} tabindex="0">
		<div class="mx-auto max-w-[68ch]">

			{#if active === "providers"}
				<header class="mb-8">
					<h1 class="text-[20px] font-medium text-bone-50">Providers</h1>
					<p class="mt-1 text-[13px] text-bone-300">
						Model providers used for chat and tool calls. Daedalus prefers the first healthy provider in this list.
					</p>
				</header>

				<ul class="divide-y divide-ink-500 border-y border-ink-500">
					{#each guiState.providerStatuses as provider}
						<li class="py-4"><ProviderStatusRow {provider} onLogin={providerLogin} onLogout={providerLogout} /></li>
					{:else}
						<li class="py-4"><ProviderStatusRow provider={{ provider: "No server providers", authenticated: false, status: "unknown" }} /></li>
					{/each}
				</ul>

				<div class="mt-6">
					<h2 class="caps mb-3 text-bone-300">models</h2>
					<ul class="divide-y divide-ink-500 border-y border-ink-500">
						{#each settings.models as model}
							<li class="grid grid-cols-[1fr_140px] items-center gap-6 py-3">
								<div>
									<div class="text-[13px] font-medium text-bone-50">{model.label ?? model.id}</div>
									<div class="font-mono text-[10.5px] text-bone-400">{model.id}</div>
								</div>
								<div class="text-right caps {settings.selectedModel === model.id ? 'text-gold' : 'text-bone-400'}">
									{#if settings.selectedModel === model.id}
										selected
									{:else if runtime}
										<button type="button" class="caps text-bone-300 hover:text-gold" onclick={() => runtime.setModel(model.id)}>select</button>
									{:else}
										{model.provider ?? "—"}
									{/if}
								</div>
							</li>
						{:else}
							<li class="py-4 font-mono text-[11px] text-bone-400">Awaiting app-server model discovery.</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if active === "approvals"}
				<header class="mb-8">
					<h1 class="text-[20px] font-medium text-bone-50">Approvals</h1>
					<p class="mt-1 text-[13px] text-bone-300">
						Approval policy and automation guardrails stay separate from provider selection.
					</p>
				</header>

				<dl class="divide-y divide-ink-500 border-y border-ink-500">
					<div class="grid grid-cols-[180px_1fr] items-baseline gap-6 py-4">
						<dt class="text-[13px] text-bone-100">Access mode</dt>
						<dd class="font-mono text-[12px] text-bone-300">{guiState.accessMode}</dd>
					</div>
					<div class="grid grid-cols-[180px_1fr] items-baseline gap-6 py-4">
						<dt class="text-[13px] text-bone-100">Hard blocks bypass</dt>
						<dd class="font-mono text-[12px] text-bone-300">
							{guiState.accessPolicy?.bypassHardBlocks === false ? "false" : "unavailable"}
						</dd>
					</div>
				</dl>

				<div class="mt-6">
					<h2 class="caps mb-3 text-bone-300">automation</h2>
					<AutomationRulesPanel />
				</div>
			{/if}

			{#if active === "appearance"}
				<header class="mb-8">
					<h1 class="text-[20px] font-medium text-bone-50">Appearance</h1>
					<p class="mt-1 text-[13px] text-bone-300">Theme is schema-backed; switching is limited to available theme names.</p>
				</header>

				<dl class="divide-y divide-ink-500 border-y border-ink-500">
					<div class="grid grid-cols-[180px_1fr_120px] items-center gap-6 py-4">
						<dt class="text-[13px] text-bone-100">Theme</dt>
						<dd class="text-[13px] text-bone-300">{settings.theme}<span class="ml-3 font-mono text-[10.5px] text-bone-400">current schema value</span></dd>
						<div class="text-right"><button type="button" class="caps text-bone-300 hover:text-gold" onclick={() => setSetting("theme", settings.theme === "daedalus-dark" ? "obsidian" : "daedalus-dark")}>toggle</button></div>
					</div>
					<div class="grid grid-cols-[180px_1fr_120px] items-center gap-6 py-4">
						<dt class="text-[13px] text-bone-100">Terminal images</dt>
						<dd class="text-[13px] text-bone-300">{settings.terminal.showImages ? "enabled" : "disabled"}</dd>
						<div class="text-right"><button type="button" class="caps text-bone-300 hover:text-gold" onclick={() => setSetting("terminal.showImages", !settings.terminal.showImages)}>toggle</button></div>
					</div>
				</dl>
			{/if}

			{#if active === "keybindings"}
				<header class="mb-8">
					<h1 class="text-[20px] font-medium text-bone-50">Keybindings</h1>
					<p class="mt-1 text-[13px] text-bone-300">Keybindings are read from the backend registry. Editing individual bindings is disabled until write support lands.</p>
				</header>
				{#if keybindingsDisabledReason}
					<p class="mt-3 font-mono text-[11px] text-bone-400">{keybindingsDisabledReason}</p>
				{/if}

				<ul class="divide-y divide-ink-500 border-y border-ink-500">
					{#each settings.keybindings as kb}
						<li class="flex items-baseline justify-between gap-6 py-3">
							<span class="text-[13px] text-bone-100">{kb.label}</span>
							<kbd class="rounded-sm border border-ink-500 px-2 py-0.5 font-mono text-[11px] text-bone-200">{kb.combo}</kbd>
						</li>
					{/each}
				</ul>
			{/if}

			{#if active === "integrations"}
				<header class="mb-8">
					<h1 class="text-[20px] font-medium text-bone-50">Integrations</h1>
					<p class="mt-1 text-[13px] text-bone-300">External services Daedalus can read from or post to.</p>
				</header>

				<ul class="divide-y divide-ink-500 border-y border-ink-500">
					{#each guiState.integrations as integration}
						<li class="grid grid-cols-[160px_1fr_120px] items-center gap-6 py-4">
							<div class="text-[13px] font-medium text-bone-50">{integration.provider}</div>
							<div class="font-mono text-[11px] text-bone-300">
								{integration.repository ? `${integration.repository.owner}/${integration.repository.name}` : "—"}
							</div>
							<div class="text-right caps {integration.status === 'connected' ? 'text-gold' : 'text-bone-400'}">{integration.status}</div>
						</li>
					{:else}
						<li class="py-4 font-mono text-[11px] text-bone-400">No integrations configured.</li>
					{/each}
				</ul>
			{/if}

			{#if active === "extensions"}
				<header class="mb-8">
					<h1 class="text-[20px] font-medium text-bone-50">Extensions</h1>
					<p class="mt-1 text-[13px] text-bone-300">Installed Daedalus resources with source paths, diagnostics, and disabled reasons.</p>
					<button type="button" class="caps mt-3 text-bone-300 hover:text-gold" onclick={reloadResources}>reload resources</button>
				</header>

				{#if resourcesVm.diagnostics.length > 0}
					<ul class="mb-4 font-mono text-[11px] text-[color:var(--crimson)]">{#each resourcesVm.diagnostics as diagnostic}<li>{diagnostic}</li>{/each}</ul>
				{/if}
				<ExtensionsManager resources={resources} />
			{/if}

			{#if active === "diagnostics"}
				<header class="mb-8">
					<h1 class="text-[20px] font-medium text-bone-50">Diagnostics</h1>
					<p class="mt-1 text-[13px] text-bone-300">
						Diagnostics are visible; export controls are disabled until the export capability is wired.
					</p>
					{#if exportDisabledReason}
						<p class="mt-3 font-mono text-[11px] text-bone-400">{exportDisabledReason}</p>
					{/if}
				</header>

				<dl class="divide-y divide-ink-500 border-y border-ink-500">
					<div class="grid grid-cols-[180px_1fr] items-baseline gap-6 py-4">
						<dt class="text-[13px] text-bone-100">Connection</dt>
						<dd class="font-mono text-[12px] {guiState.connected ? 'text-gold' : 'text-bone-400'}">
							{guiState.connected ? "connected" : "disconnected"}
						</dd>
					</div>
					<div class="grid grid-cols-[180px_1fr] items-baseline gap-6 py-4">
						<dt class="text-[13px] text-bone-100">Recent diagnostics</dt>
						<dd class="font-mono text-[11px] text-bone-300">
							{guiState.diagnostics.length} entries
						</dd>
					</div>
				</dl>
			{/if}

		</div>
	</div>
</div>
