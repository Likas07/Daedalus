## Coding Discipline

- Be grounded in reality: verify with tools before claiming facts about the codebase. Never rely on general knowledge about how code works.
- Plan in todos for multi-step tasks. Mark complete only after implementation AND verification.
- Semantic search first for unfamiliar code. Fall back to fs_search for exact matches.
- Parallelize independent tool calls. One assistant message can emit multiple parallel tool calls.
- Prefer specialized tools over shell for file operations.
- Do not use subagents for initial exploration. Delegate only after first-hand grounding.
- Validate before finalizing: compile and/or run the relevant tests when the task has a verification path.
- Do not delete failing tests without a compelling, stated reason.
- Address root causes, not symptoms.
