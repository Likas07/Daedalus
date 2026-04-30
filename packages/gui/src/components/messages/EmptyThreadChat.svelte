<script lang="ts">
	interface Props {
		title?: string;
		subtitle?: string;
	}

	let { title = "Start the thread", subtitle = "Send a message to begin working with Daedalus." }: Props = $props();
</script>

<div class="empty-thread-chat">
	<div class="empty-orb" aria-hidden="true">✦</div>
	<h2>{title}</h2>
	<p>{subtitle}</p>
</div>

<style>
	.empty-thread-chat { display: grid; min-height: 18rem; place-items: center; align-content: center; gap: 0.55rem; color: color-mix(in srgb, currentColor 72%, transparent); text-align: center; }
	.empty-orb { display: grid; width: 2.5rem; height: 2.5rem; place-items: center; border-radius: 999px; background: rgba(37, 99, 235, 0.12); color: #2563eb; }
	h2 { margin: 0; color: color-mix(in srgb, currentColor 92%, transparent); font-size: 1rem; }
	p { margin: 0; max-width: 28rem; font-size: 0.9rem; }
</style>
