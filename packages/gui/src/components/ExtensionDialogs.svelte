<script lang="ts">
	import type { ExtensionUiField, ExtensionUiRequest } from "@daedalus-pi/app-server-protocol";
	const { requests, respond } = $props<{
		requests: readonly ExtensionUiRequest[];
		respond: (request: ExtensionUiRequest, actionId: string, values: Record<string, unknown>) => void;
	}>();

	function collect(form: HTMLFormElement, fields: readonly ExtensionUiField[]): Record<string, unknown> {
		const values: Record<string, unknown> = {};
		for (const field of fields) {
			const input = form.elements.namedItem(field.id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
			if (!input) continue;
			values[field.id] = field.type === "boolean" ? (input as HTMLInputElement).checked : field.type === "number" ? Number(input.value) : input.value;
		}
		return values;
	}
</script>

{#if requests.length > 0}
	<section class="fixed right-4 top-14 z-50 w-[420px] space-y-2">
		{#each requests as request}
			<form data-request-id={request.requestId} class="rounded-xl border border-cyan-500/30 bg-zinc-950 p-4 shadow-2xl shadow-black/50" onsubmit={(event) => event.preventDefault()}>
				<div class="mb-3"><p class="text-sm font-semibold text-zinc-100">{request.title}</p><p class="mt-1 text-xs text-zinc-400">{request.description ?? request.extensionId}</p></div>
				<div class="space-y-2">
					{#each request.fields as field}
						<label class="block text-xs text-zinc-400">{field.label}
							{#if field.type === 'textarea'}
								<textarea name={field.id} data-field-type={field.type} placeholder={field.placeholder} required={field.required} class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-cyan-600 min-h-20">{field.defaultValue ?? ''}</textarea>
							{:else if field.type === 'select'}
								<select name={field.id} data-field-type={field.type} required={field.required} class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-cyan-600" value={String(field.defaultValue ?? '')}>{#each field.options ?? [] as option}<option value={String(option.value)}>{option.label}</option>{/each}</select>
							{:else if field.type === 'boolean'}
								<input name={field.id} data-field-type={field.type} type="checkbox" checked={Boolean(field.defaultValue)} class="mt-2" />
							{:else}
								<input name={field.id} data-field-type={field.type} type={field.type} value={String(field.defaultValue ?? '')} placeholder={field.placeholder} required={field.required} class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-cyan-600" />
							{/if}
						</label>
					{/each}
				</div>
				<div class="mt-4 flex justify-end gap-2">
					{#each request.actions as action}
						<button type="button" data-action-id={action.id} class="rounded-md border px-3 py-1.5 text-xs {action.style === 'primary' ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200' : 'border-zinc-700 bg-zinc-900 text-zinc-300'}" onclick={(event) => event.currentTarget.form && respond(request, action.id, collect(event.currentTarget.form, request.fields))}>{action.label}</button>
					{/each}
				</div>
			</form>
		{/each}
	</section>
{/if}


