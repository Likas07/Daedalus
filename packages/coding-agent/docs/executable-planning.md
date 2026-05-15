# Executable Planning

Executable planning is the Daedalus workflow for turning a validated implementation plan into bounded, resumable execution. It combines Muse planning, Daedalus validation, plan execution tooling, task-bound Workers, and final verification.

## Happy path

1. **Muse creates the plan.** For executable implementation plans, Muse loads the `writing-plans` skill, creates the structured plan with `plan_create`, and runs `plan_validate` before handoff. Muse should fix validation failures before returning the plan.
2. **Daedalus re-validates before execution.** Muse validation is a handoff gate, not permission to execute. The parent Daedalus session should run `plan_validate` again on the returned plan artifact before starting work.
3. **Daedalus starts or resumes execution.** Run `execute_plan(path=<plan_path>, resume=true)` so interrupted or partially completed plans continue from recorded state instead of starting over.
4. **Daedalus selects ready work.** The Daedalus selector uses `plan_task_read` to inspect the next ready task and its binding context.
5. **One task-bound Worker per ready task.** Daedalus delegates each ready task to one Worker bound to that specific plan task. Parallel ready tasks may receive separate Workers when policy and dependencies allow it.
6. **The bound Worker reads its task.** A task-bound Worker calls zero-argument `plan_task_read()` to obtain its assigned task, scope, dependencies, and completion contract. The Worker should stay within that task and return scoped implementation and verification evidence.
7. **Unbound Workers do not read plan tasks.** Workers that are not bound to a plan task have no `plan_task_read` access and should rely only on their task packet and normal tools.
8. **Daedalus reviews and verifies.** Daedalus synthesizes Worker results, performs final verification, and marks plan tasks complete only when the implementation and verification evidence support it.

## Review defaults

Daedalus defaults to whole-plan or final review rather than adding reviewers to every task. Use a final review when the full implementation is ready to evaluate across task boundaries.

Risky task-bound reviewers are optional. Add a reviewer bound to a specific task when that task has elevated risk, such as security-sensitive changes, migration logic, broad refactors, unclear ownership boundaries, or high blast radius.

## Scope and safety notes

- **Task binding is mandatory for implementation Workers.** Each ready plan task should have at most one task-bound Worker responsible for it.
- **File scope is advisory in v1.** Plan task file scopes guide Workers and reviewers, but they are not a hard sandbox boundary. Workers must still use judgment and report when required edits exceed the advertised scope.
- **Final verification is required.** Do not report the executable plan complete until Daedalus has run appropriate verification for the whole change, including tests, checks, or manual validation called for by the plan.
- **Resume by default.** Prefer `execute_plan(..., resume=true)` for continuing plans so completed work and recorded task state are preserved.

## Minimal command sequence

```text
Muse:      writing-plans -> plan_create -> plan_validate
Daedalus:  plan_validate
Daedalus:  execute_plan(path=<plan_path>, resume=true)
Daedalus:  plan_task_read  # selector reads ready work
Worker:    plan_task_read() # zero-arg call for its bound task
Daedalus:  final review and verification
```
