# Subagents for Daedalus — Design

Date: 2026-04-16
Status: Proposed and user-approved for planning

## Summary

Daedalus should add a real subagent system built from **core runtime primitives** plus a **first-party orchestrator starter pack**.

The design should combine:
- the **persona clarity and orchestration feel** of OhMyOpenAgent
- the **session-backed runtime implementation** of oh-my-pi
- Daedalus's existing philosophy of a **small core with extensible higher-level behavior**

V1 should ship:
- one opt-in primary mode: `orchestrator`
- four bundled specialist subagents: `scout`, `planner`, `worker`, `reviewer`
- aggressive delegation behavior
- real child sessions for inspection
- runtime-enforced tool and path policy per role
- compact task packets instead of parent transcript inheritance

The core delegation primitive should be **generic `subagent` execution**. Higher-level task orchestration and built-in workflows should be layered on top of that primitive rather than replacing it.

## Reference analysis

### OhMyOpenAgent

What is worth borrowing:
- a clear main orchestrator persona
- small, named specialist roles with obvious jobs
- strong flow integration between planning, execution, and review
- a feeling of a coordinated team rather than a single monolithic assistant

What should not be copied directly:
- large persona prompts with repeated meta-instructions
- many layers of role theater and duplicated policies
- overly broad built-in role catalogs for v1
- high token overhead from repeated long-form handoffs

### oh-my-pi

What is worth borrowing:
- subagents implemented as real child sessions via the SDK/runtime
- explicit task packet design instead of implicit history sharing
- structured completion via a required result-submission tool
- parent/child artifact linkage and inspectable child runs
- spawn limits, recursion limits, and runtime policy enforcement

What should not be copied directly:
- full async job and swarm complexity for v1
- broad full-tool-access defaults for all agents
- every advanced isolation backend in the first iteration

## Goals

### Primary goals

1. Add a real subagent system to Daedalus.
2. Support a main orchestrator agent that aggressively delegates.
3. Keep subagent execution token-efficient by passing only the context each child needs.
4. Make child runs inspectable after and during execution.
5. Enforce role behavior with runtime policy, not prompt text alone.
6. Ship a small first-party starter pack that feels cohesive immediately.
7. Keep the design compatible with Daedalus's extensibility model.

### Non-goals for v1

1. A full OhMyOpenAgent-scale agent ecosystem.
2. A generic multi-primary-agent UX with arbitrary agent switching.
3. Category-based model routing like OmO's category system.
4. Background swarm orchestration, DAG pipelines, or CI-like unattended workflows.
5. Full session-tree semantics for child runs in `/resume`, `/fork`, and `/tree`.
6. Isolation backends such as worktrees, overlays, or branch-merge pipelines.
7. Direct subagent-to-user interaction.

## Chosen approach

### Rejected: extension-only evolution

Building only on the existing `examples/extensions/subagent/` example would be fast, but it would keep persistence, inspection, and policy enforcement too ad hoc.

### Rejected: fully native built-in orchestration system

A full core-first orchestration system would risk overcommitting too early and would push Daedalus toward a more batteries-included philosophy than desired.

### Selected: hybrid core primitives + first-party orchestrator pack

Daedalus core should provide generic subagent runtime primitives, while a bundled first-party layer provides:
- the `orchestrator` primary mode
- the starter specialist agents
- orchestration heuristics
- commands and UI affordances

This keeps the core reusable and the starter workflow replaceable.

## Product shape

Daedalus remains normal by default.

Subagents become an opt-in capability with three user-visible states:

1. **Standard mode**
   - Default Daedalus behavior
   - No orchestrator prompt additions
   - No subagent tool active by default

2. **Orchestrator session mode**
   - The current session uses the `orchestrator` primary mode
   - The `subagent` tool is active
   - Child runs can be launched and inspected

3. **Orchestrator default mode**
   - User or project settings make `orchestrator` the default primary mode
   - Standard Daedalus remains available by explicit toggle

V1 does **not** introduce arbitrary primary-agent selection. It introduces one built-in primary mode: `orchestrator`.

## User experience

### Default behavior

If subagents are not enabled, Daedalus should behave exactly as it does today.

### Enabling orchestrator mode

V1 should provide:
- a session command to toggle orchestrator mode
- user/project settings to make orchestrator the default

Recommended command surface:
- `/orchestrator on`
- `/orchestrator off`
- `/orchestrator status`
- `/agents` to list built-in and discovered agent definitions
- `/subagents` to inspect active or persisted child runs for the current parent session

### What users should see inline

When the orchestrator delegates, the parent session should show compact inline records containing:
- agent name
- short task summary
- current status
- compact result summary on completion
- hint that the full child run can be inspected via `/subagents`

## Core runtime architecture

## 1. Generic primitive: `subagent`

The foundational primitive should be a generic `subagent` runner, not a specialized task orchestration framework.

The primitive should accept a structured request describing:
- which agent definition to use
- the task packet
- policy overrides
- output contract
- parent linkage metadata

Higher-level orchestration behavior should be implemented on top of this primitive.

### Proposed conceptual API

```ts
interface SubagentRunRequest {
  agent: string;
  goal: string;
  assignment: string;
  context?: string;
  outputSchema?: unknown;
  policy?: Partial<SubagentPolicy>;
  metadata?: {
    parentSessionFile?: string;
    parentRunId?: string;
    taskLabel?: string;
  };
}

interface SubagentRunResult {
  runId: string;
  agent: string;
  status: "completed" | "failed" | "aborted";
  summary: string;
  data?: unknown;
  error?: string;
  childSessionFile: string;
  resultArtifactPath?: string;
}
```

Daedalus core should expose an API with this contract even if the final exported names differ.

## 2. Child sessions

Subagents should run as real child `AgentSession`s created in-process via the SDK/runtime.

Each child session should:
- run with `hasUI = false`
- stream events back to the parent runtime for rendering and inspection
- be persisted to its own session file
- be configured with role-specific tools and path policy
- use a compact system prompt consisting of a shared base contract plus a role delta

Child sessions should not appear in the normal top-level session listing.

## 3. Parent/child storage model

For parent session file:

```text
/path/to/<session>.jsonl
```

V1 should store child artifacts under:

```text
/path/to/<session>/subagents/
```

Where the directory is based on the parent session file without the `.jsonl` suffix.

Per child run, store:
- `<runId>.jsonl` — child session transcript
- `<runId>.result.json` — final structured result when present
- `<runId>.context.md` — spilled task context artifact when needed

This keeps child runs hidden from normal session browsing while making them easy to inspect from the parent.

## 4. Parent linkage model

V1 should avoid adding new built-in session entry types unless necessary.

Instead:
- the parent `subagent` tool result should persist linkage metadata in `details`
- child sessions should begin with a `custom` session entry using `customType: "subagent-run"` and data recording:
  - parent session file
  - parent run id
  - agent name
  - compact task summary

This is enough to support:
- inline rendering
- persisted inspection
- export/debugging
- future migration to richer built-in session entries if needed

### Required parent-side persisted metadata

Each completed subagent run must persist at least:
- `runId`
- `agent`
- `status`
- `summary`
- `childSessionFile`
- `resultArtifactPath` when present
- `usage` summary if available

Conceptually, the tool result details should contain:

```ts
interface SubagentToolRunDetails {
  runId: string;
  agent: string;
  status: "completed" | "failed" | "aborted";
  summary: string;
  childSessionFile: string;
  resultArtifactPath?: string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    cost?: number;
  };
}
```

## 5. Result submission contract

Each child session must have a required structured completion tool, named either `submit_result` or an equivalent Daedalus-native alias.

For v1, the behavior must be:
- child must call the completion tool exactly once
- the completion tool accepts either success data or an error/blocker result
- optional schema validation is applied when an output schema is provided
- if the child exits cleanly without submitting, the runtime issues reminder prompts
- if the child still fails to submit, the run is marked failed and the parent receives a system warning in the result

This makes child runs reliable workers rather than unstructured chats.

## 6. Subagent system prompt structure

To keep token cost low, the child system prompt should be built from two layers.

### Shared base contract

All child sessions share a compact base contract that states:
- this is delegated work
- no direct user interaction
- stay within allowed tools and paths
- do not spawn additional agents unless allowed
- execute the task and submit the result once
- if blocked, submit a structured blocker result rather than asking the user directly

### Role delta

Each role adds only its specialization.

This keeps persona clarity while avoiding repeated long-form policy sections.

## Context model

## 1. Full conversation stays with the parent

The parent/orchestrator session retains the full conversation.

## 2. Children receive task packets, not transcript replay

Subagents should **not** inherit the parent conversation history by default.

Each child gets a task packet containing only:
- role
- goal
- assignment
- selected constraints
- selected files or snippets
- relevant previous agent findings
- expected deliverable format

## 3. Static project context inheritance

Child sessions should still inherit normal static Daedalus context, including:
- system prompt base
- project/global context files
- discovered skills and prompt templates, when applicable

The task packet must **not** repeat static project rules already available through normal Daedalus context loading.

## 4. Compact context spillover

If packet context becomes too large to include inline efficiently, the runtime should spill the supporting material to `<runId>.context.md` and reference that file in the child system prompt.

V1 default behavior:
- inline task packet until combined context exceeds **12 KB** of packet text
- beyond that threshold, spill supporting material to the context artifact file
- keep the inline prompt limited to the essential summary and the path to the spilled context file

This is the primary token-efficiency mechanism.

## Agent definitions and discovery

Agent definitions should use markdown files with YAML frontmatter.

Required fields:
- `name`
- `description`
- markdown body, which is the agent system prompt

Optional frontmatter fields:
- `tools`
- `spawns`
- `model`
- `thinkingLevel`
- `output`
- `toolPolicy`

### Discovery order

V1 should support:
- bundled first-party agents
- user agents from `~/.daedalus/agent/agents/*.md`
- project agents from `.daedalus/agents/*.md`

Precedence should be:
- project overrides user
- user overrides bundled
- exact-name first-wins after precedence ordering

### Built-in starter pack

Bundled agents:
- `orchestrator`
- `scout`
- `planner`
- `worker`
- `reviewer`

Custom subagents should be allowed in v1, but custom primary-agent switching is out of scope except for the built-in `orchestrator` mode.

## Role and policy model

Policy must be enforced at runtime.

### Core policy fields

```ts
interface SubagentPolicy {
  allowedTools: string[];
  writableGlobs: string[];
  readableGlobs?: string[];
  spawns: string[] | "*" | [];
  maxDepth?: number;
}
```

V1 must support these controls even if the final exported type names differ.

### Starter pack role matrix

#### `orchestrator`
- primary mode only
- can invoke `subagent`
- may use read/search tools
- may write markdown/session artifact files only
- should not mutate source code directly by default
- starter-pack spawn allowlist: `scout`, `planner`, `worker`, `reviewer`

#### `scout`
- read/search/bash tools
- markdown-only `write` / `edit` / `hashline_edit`
- no spawning in bundled definition

#### `planner`
- read/search tools
- markdown-only `write` / `edit` / `hashline_edit`
- no spawning in bundled definition

#### `worker`
- full coding tools
- unrestricted source mutation within normal Daedalus tool boundaries
- no spawning in bundled definition

#### `reviewer`
- read/search/bash tools
- markdown-only `write` / `edit` / `hashline_edit`
- no spawning in bundled definition

### Markdown-only write rule

For bundled `scout`, `planner`, and `reviewer`, runtime must enforce that file mutation tools may only target:
- files inside the current workspace or the current parent session's subagent artifact directory
- paths whose final filename ends with `.md`

These roles must not be able to mutate source files such as `.ts`, `.js`, `.rs`, `.py`, etc.

## Recursion and spawn rules

Core runtime must support spawn restrictions and depth limits.

### Defaults

- global default `maxDepth = 2`
- bundled starter pack uses only one effective spawn level because only `orchestrator` spawns
- same-agent self-recursion must be blocked by default

Custom agents may opt into spawning, but the bundled starter pack should keep all spawning centralized in `orchestrator` for v1.

## Built-in role result schemas

The starter pack should use structured outputs with default schemas so the orchestrator can consume them predictably.

### `scout`

```ts
interface ScoutResult {
  summary: string;
  files: Array<{
    path: string;
    why: string;
    ranges?: string[];
  }>;
  architecture?: string[];
  nextStep?: "planner" | "worker" | "reviewer" | "ask-user";
}
```

### `planner`

```ts
interface PlannerResult {
  goal: string;
  steps: string[];
  filesToModify: string[];
  newFiles?: string[];
  risks?: string[];
}
```

### `worker`

```ts
interface WorkerResult {
  summary: string;
  changedFiles: string[];
  verificationNotes?: string[];
  blockers?: string[];
}
```

### `reviewer`

```ts
interface ReviewerResult {
  verdict: "pass" | "warning" | "fail";
  summary: string;
  findings: Array<{
    severity: "critical" | "warning" | "suggestion";
    path?: string;
    line?: number;
    message: string;
  }>;
}
```

These schemas are intentionally small. V1 should prefer compact structured outputs over verbose prose contracts.

## Orchestration behavior

The orchestrator should be prompt-led but runtime-supported.

### Responsibilities

The orchestrator decides:
- whether to delegate
- which agent to call
- what packet to build
- whether tasks may run in parallel
- whether to ask the user or continue autonomously

The runtime enforces:
- tool and path restrictions
- spawn and depth limits
- result submission rules
- child session persistence and linkage

### Default heuristics

#### 1. Research or unclear scope
Use:
- `scout`
- then `planner` if the outcome should become an execution plan

#### 2. Clearly scoped implementation
Use:
- `worker`
- then `reviewer` unless the task is trivial and explicitly low-risk

#### 3. Large or unfamiliar implementation
Use:
- one or more `scout` runs in parallel for orthogonal search angles
- then `planner`
- then `worker`
- then `reviewer`

#### 4. Review-only requests
Use:
- `reviewer`

### Parallelism rules

V1 should allow parallel child runs only when outputs are independent.

Allowed:
- multiple `scout` runs against different search questions
- multiple `reviewer` runs over different scopes when explicitly partitioned

Deferred from v1:
- conflicting parallel `worker` runs
- general-purpose DAG or swarm orchestration
- unattended background fan-out pipelines

### Concurrency default

V1 default max concurrency should be **4** child runs.

## Model selection

V1 should not implement a category-based routing layer.

Instead:
- each bundled role may specify a default model and thinking level
- user/project settings may override per-agent model and thinking level
- if no override exists, the parent session model is inherited

### Example settings shape

```json
{
  "subagents": {
    "enabled": true,
    "defaultPrimary": "orchestrator",
    "maxDepth": 2,
    "maxConcurrency": 4,
    "agents": {
      "scout": { "model": "anthropic/claude-haiku-4-5" },
      "planner": { "model": "anthropic/claude-sonnet-4-5" },
      "worker": { "model": "anthropic/claude-sonnet-4-5" },
      "reviewer": { "model": "anthropic/claude-sonnet-4-5" }
    }
  }
}
```

The shipped settings must support this behavior even if the final key names differ.

## Inspection and observability

V1 must make child runs inspectable both while active and after completion.

### Required runtime features

- in-memory registry of active child runs for the current parent session
- persisted linkage to child session files
- compact inline status rendering
- command to inspect current session's child runs

### Required `/subagents` behavior

`/subagents` should:
- list active child runs first
- list persisted child runs for the current parent session after that
- show agent, status, start time, and short summary
- allow opening a read-only transcript view of the child session

### Deferred from v1

- exposing child runs in the normal `/resume` picker
- full `/tree` integration for child runs
- internal URL schemes such as `agent://` or `subagent://`

## Direct user interaction policy

Subagents should not directly ask the user questions in v1.

If a child run is blocked, it must return a structured blocker result to the orchestrator.

The orchestrator then decides whether to:
- ask the user a clarifying question
- reroute to another specialist
- continue with a bounded assumption

This keeps UX coherent and prevents nested interaction flows.

## SDK and extension integration

Core should expose subagent primitives to both:
- internal Daedalus features
- extension authors

At minimum, the SDK/runtime should expose:
- child session creation helper
- task packet runner
- active run registry hooks
- role policy enforcement hooks

The first-party orchestrator pack should be implemented on top of those primitives, not by using private code paths.

## Phasing

### Phase 1: Core primitives

Deliver:
- `SubagentRunner`-equivalent runtime service
- child session persistence under parent artifact directory
- result submission contract
- policy enforcement
- parent linkage metadata

### Phase 2: First-party starter pack

Deliver:
- `orchestrator` primary mode
- bundled `scout`, `planner`, `worker`, `reviewer`
- `/orchestrator`, `/agents`, `/subagents`
- default inline rendering

### Phase 3: Refinement

Deliver:
- better live observer UI
- richer per-agent settings
- optional additional bundled agents if justified by usage

## Risks and mitigations

### Risk: orchestrator prompt becomes bloated

Mitigation:
- shared base contract
- tiny role deltas
- runtime-enforced policy
- compact structured child outputs

### Risk: aggressive delegation explodes token cost

Mitigation:
- no parent transcript inheritance
- 12 KB inline packet threshold with spillover artifact
- compact default result schemas
- limited starter pack

### Risk: role policy is soft and easily bypassed

Mitigation:
- enforce allowed tool names and writable globs in runtime
- do not rely on prompt text for write restrictions

### Risk: child persistence becomes hard to inspect after restart

Mitigation:
- stable subagent artifact directory per parent session
- persist child session file paths in parent tool result details
- make `/subagents` scan persisted runs for the current parent session

## Acceptance criteria

This design is satisfied when all of the following are true:

1. Daedalus can run a child agent as a real in-process child session.
2. Child runs are stored separately from the parent session and can be inspected later.
3. The parent session stores stable linkage metadata to each child run.
4. Child sessions do not inherit parent conversation history by default.
5. Child sessions receive compact task packets and may read a spilled context artifact when packet context is large.
6. Child sessions must return results through a structured completion tool.
7. Runtime enforces role-specific tool and path restrictions.
8. Bundled `scout`, `planner`, and `reviewer` can write markdown but cannot mutate source files.
9. Bundled `worker` can mutate source files.
10. Bundled `orchestrator` delegates aggressively and is available as an opt-in primary mode.
11. `/agents` lists available bundled and discovered subagent definitions.
12. `/subagents` can inspect active and persisted child runs for the current parent session.
13. Standard Daedalus remains unchanged unless orchestrator mode or subagents are enabled.

## Final recommendation

Daedalus v1 subagents should be implemented as a **generic, session-backed `subagent` runtime primitive** with **first-party orchestrator and specialist personas layered on top**.

This delivers:
- OmO's role clarity and orchestration feel
- oh-my-pi's runtime reliability and inspectability
- Daedalus's preference for a small reusable core with opt-in higher-level behavior
