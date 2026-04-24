# Forge-style Operation Frame Compaction in Daedalus

Daedalus now preserves a deterministic operation frame during compaction, adapted from Forge's compaction flow:

- Forge source: `harnesses/forgecode/crates/forge_app/src/compact.rs`
- Forge transformer pipeline: `harnesses/forgecode/crates/forge_app/src/transformers/compaction.rs`
- Forge renderer template: `harnesses/forgecode/templates/forge-partial-summary-frame.md`

## Behavior

Before LLM summarization, Daedalus converts compacted conversation messages into a structured operation frame. The frame records the operational state that matters most for coding work:

- file reads
- file updates
- deletes / undo
- exact and semantic searches
- shell commands and exit codes
- fetches
- skills
- task/subagent calls
- todo reads/writes
- MCP calls

The frame is passed through a Forge-style transformer pipeline:

1. drop system-like frames
2. dedupe consecutive user entries
3. trim consecutive duplicate assistant tool operations by operation key
4. strip the current working directory from path-bearing operations

The rendered frame is appended to the normal Daedalus LLM-generated compaction summary. The structured frame is also stored in `CompactionEntry.details.operationFrame` so repeated compactions can merge frames deterministically instead of relying on the summarizer to preserve the prior frame text.

## Droppable messages

Droppable custom messages are excluded from compaction input and skipped from live context after compaction. This preserves Forge's behavior where ephemeral context, such as resume reminders or transient injected context, can inform the immediate turn without polluting long-term compacted state.

## Prompt safety

Rendered operation-frame text uses dynamic Markdown code fences/spans so user-controlled text, paths, commands, search patterns, URLs, and todo content cannot prematurely break out of the summary-frame markup.
