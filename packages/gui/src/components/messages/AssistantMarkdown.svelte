<script lang="ts">
	interface Props {
		content: string;
	}

	let { content }: Props = $props();

	const escapeHtml = (value: string) =>
		value
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;")
			.replaceAll('"', "&quot;")
			.replaceAll("'", "&#39;");

	function renderInline(value: string): string {
		return escapeHtml(value)
			.replace(/`([^`]+)`/g, "<code>$1</code>")
			.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
			.replace(/\*([^*]+)\*/g, "<em>$1</em>")
			.replace(/\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
	}

	function renderMarkdown(value: string): string {
		const blocks: string[] = [];
		let inCode = false;
		let code: string[] = [];
		let list: string[] = [];

		const flushList = () => {
			if (list.length > 0) {
				blocks.push(`<ul>${list.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
				list = [];
			}
		};

		for (const line of value.split("\n")) {
			if (line.trim().startsWith("```")) {
				if (inCode) {
					blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
					code = [];
				} else {
					flushList();
				}
				inCode = !inCode;
				continue;
			}
			if (inCode) {
				code.push(line);
				continue;
			}
			const bullet = line.match(/^\s*[-*]\s+(.+)$/);
			if (bullet?.[1]) {
				list.push(bullet[1]);
				continue;
			}
			flushList();
			if (line.trim().length === 0) continue;
			blocks.push(`<p>${renderInline(line)}</p>`);
		}
		flushList();
		if (inCode && code.length > 0) blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
		return blocks.join("");
	}

	let html = $derived(renderMarkdown(content));
</script>

<div class="assistant-markdown">{@html html}</div>

<style>
	.assistant-markdown :global(p) { margin: 0 0 0.6rem; }
	.assistant-markdown :global(p:last-child) { margin-bottom: 0; }
	.assistant-markdown :global(code) { border-radius: 0.35rem; background: rgba(127, 127, 127, 0.14); padding: 0.08rem 0.25rem; }
	.assistant-markdown :global(pre) { overflow: auto; border-radius: 0.75rem; background: rgba(15, 23, 42, 0.88); color: white; padding: 0.8rem; }
	.assistant-markdown :global(ul) { margin: 0.25rem 0 0.7rem; padding-left: 1.2rem; }
	.assistant-markdown :global(a) { color: currentColor; text-decoration: underline; text-underline-offset: 0.18em; }
</style>
