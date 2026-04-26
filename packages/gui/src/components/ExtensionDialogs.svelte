<script lang="ts">
	import type { ExtensionUiField, ExtensionUiRequest } from "@daedalus-pi/app-server-protocol";
	const { requests, respond, close } = $props<{
		requests: readonly ExtensionUiRequest[];
		respond: (request: ExtensionUiRequest, actionId: string, values: Record<string, unknown>) => void;
		close?: (request: ExtensionUiRequest) => void;
	}>();

	function collect(form: HTMLFormElement, fields: readonly ExtensionUiField[]): Record<string, unknown> {
		const values: Record<string, unknown> = {};
		for (const field of fields) {
			const input = form.elements.namedItem(field.id) as
				| HTMLInputElement
				| HTMLTextAreaElement
				| HTMLSelectElement
				| null;
			if (!input) continue;
			values[field.id] =
				field.type === "boolean"
					? (input as HTMLInputElement).checked
					: field.type === "number"
						? Number(input.value)
						: input.value;
		}
		return values;
	}

	function onDialogKeydown(event: KeyboardEvent, request: ExtensionUiRequest): void {
		if (event.key === "Escape") {
			event.preventDefault();
			close?.(request);
		}
	}
</script>

{#if requests.length > 0}
	<section class="fixed right-6 top-20 z-50 w-[440px] space-y-3" aria-label="Extension dialogs">
		{#each requests as request}
			<div
				class="relative border-l border-gold bg-ink-900 shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
				role="dialog"
				aria-modal="false"
				aria-labelledby={`extension-dialog-title-${request.requestId}`}
				tabindex="-1"
				onkeydown={(event) => onDialogKeydown(event, request)}
			>
				<form
					data-request-id={request.requestId}
					onsubmit={(event) => event.preventDefault()}
				>
				<header class="border-b border-ink-500 px-5 py-3">
					<div class="caps text-bone-400">extension · request</div>
					<button
						type="button"
						aria-label="Close extension request"
						class="absolute right-4 top-3 text-bone-400 transition hover:text-bone-50"
						onclick={() => close?.(request)}
					>
						×
					</button>
					<p id={`extension-dialog-title-${request.requestId}`} class="mt-1 text-[14px] font-medium text-bone-50">{request.title}</p>
					<p class="mt-1 font-mono text-[10.5px] text-bone-400">
						{request.description ?? request.extensionId}
					</p>
				</header>

				<div class="space-y-4 px-5 py-4">
					{#each request.fields as field}
						<label class="block">
							<span class="caps mb-1.5 block text-bone-400">{field.label}</span>
							{#if field.type === "textarea"}
								<textarea
									name={field.id}
									data-field-type={field.type}
									placeholder={field.placeholder}
									required={field.required}
									class="min-h-20 w-full border border-ink-500 bg-ink-950 px-3 py-2 font-mono text-[12px] text-bone-100 focus:border-gold focus:outline-none"
								>{field.defaultValue ?? ""}</textarea>
							{:else if field.type === "select"}
								<select
									name={field.id}
									data-field-type={field.type}
									required={field.required}
									class="w-full border border-ink-500 bg-ink-950 px-3 py-2 font-mono text-[12px] text-bone-100 focus:border-gold focus:outline-none"
									value={String(field.defaultValue ?? "")}
								>
									{#each field.options ?? [] as option}
										<option value={String(option.value)}>{option.label}</option>
									{/each}
								</select>
							{:else if field.type === "boolean"}
								<input
									name={field.id}
									data-field-type={field.type}
									type="checkbox"
									checked={Boolean(field.defaultValue)}
									class="mt-1"
								/>
							{:else}
								<input
									name={field.id}
									data-field-type={field.type}
									type={field.type}
									value={String(field.defaultValue ?? "")}
									placeholder={field.placeholder}
									required={field.required}
									class="w-full border border-ink-500 bg-ink-950 px-3 py-2 font-mono text-[12px] text-bone-100 focus:border-gold focus:outline-none"
								/>
							{/if}
						</label>
					{/each}
				</div>

				<div class="flex items-center justify-end gap-4 border-t border-ink-500 px-5 py-3">
					{#each request.actions as action}
						<button
							type="button"
							data-action-id={action.id}
							class={action.style === "primary"
								? "caps border border-gold px-4 py-1.5 text-gold transition hover:bg-gold hover:text-ink-950"
								: "caps text-bone-400 transition hover:text-bone-100"}
							onclick={(event) =>
								event.currentTarget.form &&
								respond(request, action.id, collect(event.currentTarget.form, request.fields))}
						>
							{action.label}
						</button>
					{/each}
				</div>
				</form>
			</div>
		{/each}
	</section>
{/if}
