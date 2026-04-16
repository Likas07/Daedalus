# Legacy Subagent Extension Example

This example is kept as a reference for **subprocess-based orchestration**.

> Prefer the built-in starter pack in `src/extensions/daedalus/workflow/subagents/`.
> The built-in implementation uses `runSubagent()` to create **in-process child sessions** and does **not** shell out to another `daedalus` process.

## What this example demonstrates

- A custom `subagent` tool implemented as an extension
- Single, parallel, and chain orchestration modes
- Streaming updates from child subprocesses
- Custom rendering for tool calls and results

## Important caveat

Unlike the built-in starter pack, this example intentionally shells out to a separate `daedalus` subprocess for each delegated task. It remains here as a legacy reference for extension authors who want to study that pattern.

## Structure

```text
subagent/
├── README.md            # This file
├── index.ts             # Legacy subprocess example
├── agents.ts            # Agent discovery logic
├── agents/              # Sample agent definitions
│   ├── scout.md
│   ├── planner.md
│   ├── reviewer.md
│   └── worker.md
└── prompts/             # Workflow presets (prompt templates)
    ├── implement.md
    ├── scout-and-plan.md
    └── implement-and-review.md
```

## Installation

From the repository root, symlink the files:

```bash
mkdir -p ~/.daedalus/agent/extensions/subagent
ln -sf "$(pwd)/packages/coding-agent/examples/extensions/subagent/index.ts" ~/.daedalus/agent/extensions/subagent/index.ts
ln -sf "$(pwd)/packages/coding-agent/examples/extensions/subagent/agents.ts" ~/.daedalus/agent/extensions/subagent/agents.ts

mkdir -p ~/.daedalus/agent/agents
for f in packages/coding-agent/examples/extensions/subagent/agents/*.md; do
  ln -sf "$(pwd)/$f" ~/.daedalus/agent/agents/$(basename "$f")
done

mkdir -p ~/.daedalus/agent/prompts
for f in packages/coding-agent/examples/extensions/subagent/prompts/*.md; do
  ln -sf "$(pwd)/$f" ~/.daedalus/agent/prompts/$(basename "$f")
done
```

## Security model

This example executes a separate `daedalus` subprocess with a delegated system prompt and tool/model configuration.

**Project-local agents** (`.daedalus/agents/*.md`) are repo-controlled prompts that can instruct the model to read files, run bash commands, etc.

**Default behavior:** Only loads **user-level agents** from `~/.daedalus/agent/agents`.

To enable project-local agents, pass `agentScope: "both"` (or `"project"`). Only do this for repositories you trust.

When running interactively, the tool prompts for confirmation before running project-local agents. Set `confirmProjectAgents: false` to disable.

## Usage

### Single agent

```text
Use scout to find all authentication code
```

### Parallel execution

```text
Run 2 scouts in parallel: one to find models, one to find providers
```

### Chained workflow

```text
Use a chain: first have scout find the read tool, then have planner suggest improvements
```

### Workflow prompts

```text
/implement add Redis caching to the session store
/scout-and-plan refactor auth to support OAuth
/implement-and-review add input validation to API endpoints
```

## Agent definitions

Agents are markdown files with YAML frontmatter:

```markdown
---
name: my-agent
description: What this agent does
tools: read, grep, find, ls
model: claude-haiku-4-5
---

System prompt for the agent goes here.
```

Locations:
- `~/.daedalus/agent/agents/*.md` - user-level
- `.daedalus/agents/*.md` - project-level

Project agents override user agents with the same name when `agentScope: "both"`.

## Limits

- Output is truncated in collapsed view
- Agents are discovered fresh on each invocation
- Parallel mode is limited to 8 tasks, 4 concurrent
- This example uses subprocesses; the built-in starter pack does not
