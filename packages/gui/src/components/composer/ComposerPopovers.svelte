<script lang="ts">
	import type { ComposerFileMention, ComposerSlashCommand } from "../../client/gui-state-types";
	import FileMentionPopover from "./FileMentionPopover.svelte"; import SlashCommandPopover from "./SlashCommandPopover.svelte"; import type { ComposerTrigger } from "./composer-logic";
	const { trigger, files = [], commands = [], activeIndex = 0, onFileSelect, onCommandSelect } = $props<{ trigger: ComposerTrigger | null; files?: readonly ComposerFileMention[]; commands?: readonly ComposerSlashCommand[]; activeIndex?: number; onFileSelect?: (file: ComposerFileMention) => void; onCommandSelect?: (command: ComposerSlashCommand) => void }>();
</script>
<FileMentionPopover open={trigger?.kind === "path"} query={trigger?.query ?? ""} {files} {activeIndex} onSelect={onFileSelect} />
<SlashCommandPopover open={trigger?.kind === "slash-command"} query={trigger?.query ?? ""} {commands} {activeIndex} onSelect={onCommandSelect} />
