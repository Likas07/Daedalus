# Forge prompt doctrine → Daedalus seam map

| Forge clause | Source | Daedalus seam |
| --- | --- | --- |
| Encourage todo_write VERY frequently | forge.md 47-94 | `packages/coding-agent/src/extensions/daedalus/tools/todo.ts` `promptGuidelines` |
| Mark todos complete only after implementation + verification | forge.md 47-94 | `todo_write` guidelines + `packages/coding-agent/src/core/prompts/coding-discipline.md` |
| Semantic search first for unfamiliar code | forge.md 47-94 | `packages/coding-agent/src/extensions/daedalus/tools/sem-search.ts` guidelines + coding-discipline overlay |
| Distinguish semantic discovery from exact/regex search | forge.md 47-94 | `packages/coding-agent/src/extensions/daedalus/tools/fs-search.ts` guidelines |
| Prefer specialized tools over shell for file operations | forge.md 47-94 | `packages/coding-agent/src/core/tools/bash.ts` guidelines + coding-discipline overlay |
| Parallelize independent tool calls | forge.md 47-94 | `subagent` guidelines + coding-discipline overlay |
| Do not use subagents for initial exploration | forge.md 47-94 | `packages/coding-agent/src/extensions/daedalus/workflow/subagents/index.ts` guidelines + coding-discipline overlay |
| Preserve summary-first delegated result handling | custom agent template 32-58 | `subagent` tool guidelines |
| Validate before finalizing | forge.md 120-146 | coding-discipline overlay + existing end-of-turn verification paths |
| Do not delete failing tests without compelling reason | forge.md 120-146 | coding-discipline overlay |
| Resume current todo list into context | `user_prompt.rs` parity addendum | `packages/coding-agent/src/extensions/daedalus/tools/todo.ts` session resume injection |
| Remind once per pending todo set at end-of-turn | `hooks/pending_todos.rs` | `packages/coding-agent/src/extensions/daedalus/workflow/pending-todos-hook.ts` + `AgentSession._maybeEnforcePendingWork()` |
| Avoid contradicting role overlays | custom template doctrine | `packages/coding-agent/src/extensions/daedalus/workflow/primary-role/prompts/*.md` |
