# Dependency Graph for Forge -> Daedalus Performance Ports

Status: sequencing draft
Purpose: show dependency relationships across the current redesign work so implementation planning can respect the highest-leverage ordering.

## Scope

This graph covers the main workstreams currently in play:
- role/prompt redesign
- todo redesign
- search tooling port
- pending-work enforcement
- semantic workspace lifecycle
- doom-loop detection
- tool-call robustness
- plan execution primitive

The goal is not to describe every possible implementation dependency.
The goal is to identify which changes are foundational and which are best done only after earlier work is stable.

---

## Node list

### Foundation layer
1. Prompt / role redesign
2. Todo redesign (`todo_read` / `todo_write` + richer state model)
3. Search tooling redesign (`sem_search` + `fs_search` direction)
4. Tool-call robustness hardening

### Mid-layer performance systems
5. Pending-work enforcement
6. Semantic workspace lifecycle
7. Doom-loop detection
8. Plan execution primitive

### Higher-layer convergence
9. Plan-mode / todo convergence
10. Role-aware performance tuning (Daedalus / Sage / Muse / Worker)

---

## High-level dependency graph

```text
Prompt / role redesign
    ├──> Todo redesign
    ├──> Search tooling redesign
    └──> Role-aware performance tuning

Tool-call robustness
    ├──> Search tooling redesign
    ├──> Semantic workspace lifecycle
    ├──> Plan execution primitive
    └──> Doom-loop detection (better observability, fewer false stalls)

Todo redesign
    ├──> Pending-work enforcement
    ├──> Plan execution primitive
    ├──> Plan-mode / todo convergence
    └──> Role-aware performance tuning

Search tooling redesign
    ├──> Semantic workspace lifecycle
    └──> Role-aware performance tuning

Pending-work enforcement
    ├──> Doom-loop detection
    └──> Plan execution primitive

Semantic workspace lifecycle
    └──> Role-aware performance tuning

Plan execution primitive
    ├──> Plan-mode / todo convergence
    └──> Role-aware performance tuning

Doom-loop detection
    └──> Role-aware performance tuning
```

---

## Detailed dependency notes

## 1. Prompt / role redesign

### Why it is foundational
The role redesign establishes:
- which roles exist
- who owns planning vs research vs execution
- which tools each role should prioritize
- the behavioral doctrine for Daedalus, Sage, Muse, and Worker

### Depends on
- nothing in this sequence; it is already underway

### Blocks / influences
- todo redesign prompt assumptions
- search-tool selection doctrine
- role-aware use of pending-work enforcement
- role-aware use of `sem_search`
- Worker/Muse interaction with plan execution

### Practical takeaway
Do not implement downstream behavior in a way that assumes the old role model if the prompt/role redesign is becoming the new source of truth.

---

## 2. Todo redesign

### Why it is foundational
The todo redesign creates the explicit execution-state substrate needed for:
- pending-work enforcement
- plan execution
- stronger Worker/Muse coordination
- clearer progress tracking

### Depends on
- role redesign (to know who writes/reads todo state and why)

### Blocks / enables
- pending-work enforcement
- plan execution primitive
- plan-mode / todo convergence
- role-aware task-state behavior

### Practical takeaway
If the todo model is unstable, any unfinished-work guard or plan-execution logic built on top of it will likely need rework.

---

## 3. Search tooling redesign

### Why it is foundational
Porting `sem_search` and `fs_search` changes:
- how discovery happens
- which roles search semantically vs exactly
- how Sage/Muse/Daedalus ground themselves

### Depends on
- role redesign
- ideally some tool-call robustness hardening

### Blocks / enables
- semantic workspace lifecycle
- role-aware discovery tuning

### Practical takeaway
Do not build the full semantic workspace lifecycle before the actual search-tool contract is stable enough.

---

## 4. Tool-call robustness hardening

### Why it is foundational
This is plumbing that reduces friction for everything else:
- fewer malformed tool calls
- fewer wasted turns
- more stable rollout of new tools and richer schemas

### Depends on
- not much; can begin early

### Blocks / enables
- safe rollout of sem_search/fs_search
- safe rollout of todo_read/todo_write
- safer execution of plan primitives
- more trustworthy observations for doom-loop detection

### Practical takeaway
This is one of the few things you can improve early that makes almost every later feature less brittle.

---

## 5. Pending-work enforcement

### Why it depends on todo redesign
It needs a stable definition of:
- what active work is
- how to inspect it
- how to distinguish pending vs completed vs cancelled

### Depends on
- todo redesign
- prompt/role redesign for policy expectations

### Enables
- stronger completion discipline
- better alignment between plan and execution
- stronger signal for doom-loop detection
- stronger plan execution guarantees

### Practical takeaway
Implement this after the new todo model is stable enough to avoid rewriting the enforcement logic twice.

---

## 6. Semantic workspace lifecycle

### Why it depends on search tooling redesign
It should wrap a stable `sem_search` product model, not predate it.

### Depends on
- search tooling redesign
- ideally tool-call robustness improvements

### Enables
- reliable semantic discovery
- better Sage/Muse effectiveness
- lower retrieval drift

### Practical takeaway
First define what `sem_search` is.
Then build the indexing/sync/status system around it.

---

## 7. Doom-loop detection

### Why it depends on earlier work
Doom-loop detection works better when the system already has:
- explicit task-state signals (todo redesign)
- unfinished-work signals (pending-work enforcement)
- cleaner tool behavior (tool-call robustness)

### Depends on
- preferably todo redesign
- preferably pending-work enforcement
- preferably tool-call robustness

### Enables
- less wasted turn budget
- stronger recovery from stalls
- role-aware anti-stall behavior later

### Practical takeaway
You can prototype doom-loop detection early, but it becomes much more useful and less noisy once todo state and unfinished-work enforcement exist.

---

## 8. Plan execution primitive

### Why it depends on earlier work
A real plan execution primitive needs:
- a stable planning role (Muse)
- a stable todo substrate
- some completion discipline
- likely stronger tool reliability

### Depends on
- role redesign
- todo redesign
- ideally pending-work enforcement
- ideally tool-call robustness

### Enables
- stronger planning/execution coupling
- resumable execution flows
- eventual plan-mode / todo convergence

### Practical takeaway
Do not build this on top of the old `todo` action-enum model.
It will be much cleaner once `todo_read` / `todo_write` exist.

---

## 9. Plan-mode / todo convergence

### Why it sits later
This is a convergence task, not a foundation task.
It becomes much easier after:
- todo redesign
- plan execution primitive
- role redesign stabilizes

### Depends on
- todo redesign
- plan execution primitive

### Practical takeaway
Avoid merging plan-mode and todo state too early while both are still moving targets.

---

## 10. Role-aware performance tuning

### Why it sits last
Once the systems exist, you can tune:
- when Daedalus uses sem_search vs fs_search
- when Muse consults Sage
- when Worker reads/writes task state
- how doom-loop detection thresholds vary by role
- how unfinished-work enforcement behaves for main vs subagent lanes

### Depends on
- role redesign
- todo redesign
- search tooling redesign
- pending-work enforcement
- semantic workspace lifecycle
- doom-loop detection
- plan execution primitive

### Practical takeaway
Do not over-tune role-specific behavior before the underlying systems are in place.

---

## Recommended implementation order

### Tier 1: foundations
1. Finish role/prompt redesign
2. Implement tool-call robustness hardening in parallel where possible
3. Implement todo redesign
4. Implement search tooling redesign (`sem_search` + `fs_search` contracts)

### Tier 2: first performance systems
5. Implement pending-work enforcement
6. Implement semantic workspace lifecycle
7. Prototype doom-loop detection

### Tier 3: execution convergence
8. Implement plan execution primitive
9. Improve doom-loop detection using new task-state and enforcement signals
10. Converge plan-mode and todo state where it makes sense

### Tier 4: tuning
11. Role-aware thresholds, policies, defaults, and model/runtime tuning

---

## Strongest sequencing insight

If you only remember one thing, it is this:

```text
Todo redesign and search-tool redesign are substrate work.
Pending-work enforcement and semantic workspace lifecycle are the first major performance ports on top of those substrates.
Plan execution and doom-loop detection become much stronger once those substrates exist.
```

---

## Bottom line

The most important dependency relationships are:
- todo redesign -> pending-work enforcement -> plan execution
- search tooling redesign -> semantic workspace lifecycle
- tool-call robustness -> almost everything else becomes safer to build
- doom-loop detection is best after task-state signals exist

That should be the mental model for sequencing the performance-focused Forge -> Daedalus work.
