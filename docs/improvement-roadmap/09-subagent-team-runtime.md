# 09. Subagent Team Runtime

## Why This Is Hardest

Daedalus already has subagents, roles, result envelopes, and isolation. The hard part is turning "delegate a task" into "run a coordinated team" without creating chaos, runaway cost, or unreadable state.

Inspirations:

- OhMyOpenAgent Team Mode
- OMC team pipeline
- OMX team runtime
- OhMyPi subagents with typed results
- Daedalus' existing Sage/Muse/Worker design

## Source Of The Idea

The idea comes from the framework-over-harness systems, especially OhMyOpenAgent and OMC/OMX, not from the GUI products. Those systems treat multi-agent work as a runtime pattern with roles, routing, visibility, and coordination instead of a single opaque subagent call.

Daedalus already borrowed the right foundation from Forge/OhMyOpenAgent: specialist roles and isolated subagent implementation. The next step is a team run abstraction.

## Product Shape

Add a team primitive:

```text
/team create <name>
/team run <goal>
/team status
/team inspect <member>
/team cancel
```

Model-facing tool shape:

```ts
team_run({
  goal: string;
  members: TeamMemberSpec[];
  coordination: "lead-managed" | "review-panel" | "independent-fanout";
  mergePolicy: "none" | "patch" | "branch";
})
```

## Team Members

Members are user-configured. They should route through the model routing table:

```json
{
  "name": "architecture-reviewer",
  "role": "sage",
  "modelRoute": "reviewer",
  "tools": ["read", "grep", "ast_grep", "lsp_references"],
  "write": false
}
```

## Coordination Modes

`independent-fanout`:

- members run independently
- parent synthesizes results
- good for research/review

`review-panel`:

- members critique the same plan/change
- parent compares disagreements
- good for architecture/security

`lead-managed`:

- lead assigns tasks
- members report progress
- shared task board exists
- good for large implementation

## Peer Communication

Do not start with free-form chat between agents.

Start with structured notes:

```ts
interface TeamNote {
  from: string;
  to?: string;
  kind: "finding" | "blocker" | "handoff" | "question";
  summary: string;
  artifactRefs: string[];
}
```

This avoids noisy agent-to-agent chatter while still allowing coordination.

## Runtime State

A team run should persist:

- team goal
- member specs
- model routes
- isolation handles
- task assignments
- notes
- artifacts
- costs/tokens when available
- merge status
- final synthesis

## Safety Rules

- Max concurrency is configured by user.
- Write-capable members require explicit permission.
- Merge policy is explicit.
- Parent cannot mark team complete without member result envelopes.
- Failed members produce degraded artifacts instead of disappearing.

## Acceptance Criteria

- A read-only review team can run two members in parallel and synthesize findings.
- A write-capable worker team can isolate changes and return patch artifacts.
- Team state can be inspected after interruption.
- Model routes are user-configured and recorded.
- Peer notes are structured and bounded.
