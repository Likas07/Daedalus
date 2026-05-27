# 04. Goal Evidence Ledger

## Clarification

Yes: current Codex has a goal concept. The local Codex research checkout contains a `codex-rs/ext/goal` extension and TUI tests for `/goal`. OpenAI's official Codex use-cases page also lists "Follow a goal" as a durable objective workflow:

- https://developers.openai.com/codex/use-cases/follow-goals
- https://developers.openai.com/codex/cli/slash-commands#set-an-experimental-goal-with-goal

Daedalus should not copy the surface blindly. The useful idea is a Daedalus-owned durable goal and evidence ledger that works across CLI/TUI/RPC/SDK/app-server.

## Product Shape

Add a goal primitive:

```text
/goal <objective>
/goal status
/goal pause
/goal resume
/goal clear
/goal evidence
/goal verify
```

The goal owns:

- objective
- acceptance criteria
- active task list
- blockers
- evidence entries
- verification commands
- final completion summary

## Why This Is Not Just Todos

Todos say what the agent plans to do.

A goal ledger says why the agent is still running, what would count as done, and what evidence proves done.

It should answer:

```text
What is the current objective?
What has been proven?
What failed?
What remains?
What command or artifact supports the completion claim?
```

## Data Model

Suggested core record:

```ts
interface GoalLedger {
  id: string;
  sessionId: string;
  objective: string;
  status: "active" | "paused" | "blocked" | "complete" | "budget_limited";
  acceptanceCriteria: GoalCriterion[];
  tasks: GoalTask[];
  evidence: GoalEvidence[];
  createdAt: string;
  updatedAt: string;
}
```

Evidence examples:

```ts
type GoalEvidence =
  | { kind: "test"; command: string; status: "passed" | "failed"; outputRef?: string }
  | { kind: "diff"; files: string[]; diffRef?: string }
  | { kind: "review"; reviewer: string; status: "passed" | "failed"; summary: string }
  | { kind: "artifact"; path: string; description: string }
  | { kind: "note"; text: string };
```

## Runtime Behavior

- If active, the goal is shown in the status line/footer.
- When the agent goes idle with unfinished goal tasks, the runtime may ask whether to continue.
- Completion requires at least one evidence entry unless the user explicitly waives verification.
- Budget limits pause the goal rather than losing state.
- Resuming a session with an active/paused goal should show a short resume prompt.

## Relationship To Plans

Executable plans can feed the goal ledger, but they are not the same thing.

- Plan: implementation recipe.
- Goal: durable runtime contract and proof log.

## Acceptance Criteria

- Goal state persists in session storage.
- Goal status survives resume/fork.
- Evidence entries can reference full output without dumping it into context.
- Final response can summarize evidence by reference.
- The ledger never marks complete only because the model says it is complete.
