## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore

## Daedalus GUI product direction

Model Daedalus GUI mode after T3Code/Jean: a persistent project/thread chat workspace, not a one-shot batch task runner. The user should enter a thread and keep chatting/work along with the agent instead of sending one large prompt, waiting for a single execution, and losing the session.

Use a durable hierarchy such as `Project -> Thread -> Turn`, or `Project -> Worktree -> Thread -> Turn` when worktree isolation matters. The thread/session survives across turns so the user can continuously chat, steer, approve, answer inline questions, inspect diffs/review panels, use contextual terminals, recover from interruptions, and resume work.

Chat is the center of gravity. Cockpit controls, project canvas/overview, diff/review panels, terminal panes, approvals, draft threads, and recovery tools are supporting panels around the active conversation, not the default interaction model.

## Dependency policy

Use Bun for dependency management in this repository. The root `bun.lock` is the source-of-truth lockfile and should be updated with `bun install`. Do not add or regenerate a root `package-lock.json`; npm lockfiles are stale for this workspace. Preserve example lockfiles outside the root unless a task explicitly targets them.

When dependency manifests or lockfiles change, verify with `bun install --frozen-lockfile --dry-run` from the repository root before reporting completion.
