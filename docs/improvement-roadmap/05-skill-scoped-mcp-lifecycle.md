# 05. Skill-Scoped MCP And Tool Lifecycle

## Idea

Skills should be able to bring tools with them, but only when the skill is active.

This takes the best part of OhMyOpenAgent's skill-embedded MCP idea without bloating every Daedalus session.

## Problem

Global MCP/tool registration has two failure modes:

- too many tools in context
- tools remain available outside the workflow that justifies them

Skill-scoped lifecycle fixes both.

## Product Shape

A skill can declare runtime dependencies:

```yaml
---
name: github-pr-review
description: Review GitHub PRs with repo-specific checks.
tools:
  - github
mcp:
  - name: github-pr
    command: node
    args: ["./mcp/github-pr-server.js"]
    scope: skill
permissions:
  network: true
  write: false
---
```

When the skill activates:

1. Daedalus validates permissions.
2. Daedalus starts the MCP/tool process if needed.
3. Tool metadata becomes available to the active agent.
4. The skill runs.
5. Daedalus tears down idle skill-scoped processes.

## Context Rules

- Tool descriptions are loaded only for active skill scope.
- Inactive skill tools do not appear in the normal tool list.
- Large MCP metadata should be summarized or discovered by `tool_search`, not injected wholesale.

## Security Rules

- Skill-scoped MCPs must declare network/filesystem needs.
- Project-local skills should not silently start networked tools without policy approval.
- Users need a global denylist/allowlist.
- Runtime must show which skill started which process.

## Implementation Boundary

This should build on Daedalus packages, skills, and extensions rather than inventing a separate plugin system.

Good internal model:

```text
Skill activation -> resource resolver -> scoped tool registry -> process lifecycle manager
```

## Acceptance Criteria

- A test skill can start a local MCP server only while active.
- Tool availability disappears after the skill scope ends.
- Permission denial is explicit and recoverable.
- Process crashes are reported as skill/tool failures, not generic model errors.
