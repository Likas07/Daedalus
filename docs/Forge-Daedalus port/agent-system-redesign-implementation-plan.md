# Daedalus Agent System Redesign Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Migrate Daedalus from the current Scout / Planner / Worker / Reviewer system to the Daedalus / Sage / Muse / Worker architecture, including runtime-built prompt overlays, structured subagent result envelopes, sidecar result storage, summary-first parent consumption, and resumable subagent sessions.

**Architecture:** Keep core role identity in reviewable prompt files and move execution-mode-specific behavior into runtime-built overlays. Replace the current generic subagent deliverable flow with a universal JSON result envelope whose full body is stored as a sidecar artifact keyed by `result_id`, while the parent sees only a lightweight summary reference by default. Migrate the bundled specialist registry in stages so tests and compatibility remain intact during rollout.

**Tech Stack:** TypeScript, Bun, Daedalus coding-agent core, extension runtime, subagent runner, session persistence, TypeBox/JSON-schema validation, existing subagent artifact persistence.

---

## Implementation order

Work in this order:
1. Prompt source-of-truth handoff
2. Runtime prompt overlays
3. Universal result envelope
4. Sidecar result storage + lightweight parent injection
5. `read_agent_result_output` tool
6. Bundled role registry migration
7. Resume / continuation wiring
8. Full regression coverage
9. Cleanup

Do not jump ahead. Each later stage depends on the prior one.

---

## Task 1: Freeze runtime source-of-truth files

**Objective:** Establish exactly which existing files will become the runtime source of truth for the redesign.

**Files:**
- Modify: `docs/Forge-Daedalus port/agent-system-redesign-implementation-plan.md`
- Read: `docs/Forge-Daedalus port/agent-role-redesign/agent-system-redesign-product-spec.md`
- Read: `docs/Forge-Daedalus port/agent-role-redesign/role-mapping-spec.md`
- Read: `docs/Forge-Daedalus port/agent-role-redesign/current-state-and-next-steps.md`
- Read: `packages/coding-agent/src/core/system-prompt.ts`
- Read: `packages/coding-agent/src/core/subagents/subagent-system-prompt.ts`
- Read: `packages/coding-agent/src/core/subagents/runtime-config.ts`
- Read: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/bundled.ts`

**Step 1: Review the role and product specs**

Read the four design docs and extract the fixed decisions:
- Daedalus is primary-only
- Sage / Muse / Worker are the runtime subagents
- Reviewer becomes policy, not mandatory role
- result envelope is universal JSON
- parent sees summary-first references

**Step 2: Review current runtime prompt assembly**

Read:
- `packages/coding-agent/src/core/system-prompt.ts`
- `packages/coding-agent/src/core/subagents/subagent-system-prompt.ts`
- `packages/coding-agent/src/core/subagents/runtime-config.ts`
- `packages/coding-agent/src/extensions/daedalus/workflow/subagents/bundled.ts`

Document in comments or local notes exactly where:
- primary prompt assembly happens
- subagent prompt assembly happens
- bundled agent definitions are registered

**Step 3: Verify no missing architectural questions remain**

Checklist:
- [ ] Daedalus is not a subagent
- [ ] Sage replaces Scout
- [ ] Muse replaces Planner
- [ ] Worker remains but is repositioned
- [ ] Reviewer behavior moves into Daedalus/Worker/Sage policy
- [ ] summary-first result transport is accepted

**Step 4: Commit**

```bash
git add "docs/Forge-Daedalus port/agent-system-redesign-implementation-plan.md"
git commit -m "docs: freeze source-of-truth for agent redesign plan"
```

---

## Task 2: Add new runtime prompt files for Sage and Muse

**Objective:** Create runtime prompt files for the new specialist roles so they exist alongside the current bundled prompts.

**Files:**
- Create: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/sage.md`
- Create: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/muse.md`
- Create: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/sage-overrides-claude.md`
- Create: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/sage-overrides-gpt.md`
- Create: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/muse-overrides-claude.md`
- Create: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/muse-overrides-gpt.md`
- Source: `docs/Forge-Daedalus port/agent-role-redesign/Daedalus-New/Sage.md`
- Source: `docs/Forge-Daedalus port/agent-role-redesign/Daedalus-New/Muse.md`

**Step 1: Write the failing prompt-discovery test**

Add or extend a test in:
- `packages/coding-agent/test/subagents-discovery.test.ts`

Expected behavior:
- runtime prompt directory contains `sage.md` and `muse.md`
- bundled prompt loader can read them once registered

**Step 2: Run test to verify failure**

Run:
```bash
bun test packages/coding-agent/test/subagents-discovery.test.ts
```

Expected: FAIL — missing `sage.md` and `muse.md` runtime files or discovery expectations

**Step 3: Create the prompt files**

Copy the reviewed content from:
- `docs/Forge-Daedalus port/agent-role-redesign/Daedalus-New/Sage.md`
- `docs/Forge-Daedalus port/agent-role-redesign/Daedalus-New/Muse.md`

Use them as the initial runtime sources with only minimal adaptation needed for file-frontmatter/runtime conventions.

**Step 4: Add model override stubs**

Create the four override files as empty or minimal-compatible placeholders if no real override text is needed yet. This avoids runtime lookup churn.

**Step 5: Run test to verify pass**

Run:
```bash
bun test packages/coding-agent/test/subagents-discovery.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/sage.md \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/muse.md \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/sage-overrides-claude.md \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/sage-overrides-gpt.md \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/muse-overrides-claude.md \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/muse-overrides-gpt.md \
  packages/coding-agent/test/subagents-discovery.test.ts
git commit -m "feat: add runtime prompt files for sage and muse"
```

---

## Task 3: Map Daedalus main-agent prompt sources to the redesign

**Objective:** Tie the reviewed Daedalus redesign prompt direction to the actual main-agent runtime sources.

**Files:**
- Modify: `packages/coding-agent/src/core/prompts/daedalus-persona.md`
- Modify: `packages/coding-agent/src/core/prompts/daedalus-constitution.md`
- Modify: `packages/coding-agent/src/core/prompts/daedalus-overrides-claude.md`
- Modify: `packages/coding-agent/src/core/prompts/daedalus-overrides-gpt.md`
- Reference: `docs/Forge-Daedalus port/agent-role-redesign/Daedalus-New/Daedalus.md`
- Test: `packages/coding-agent/test/system-prompt.test.ts`
- Test: `packages/coding-agent/test/prompt-model-overrides.test.ts`

**Step 1: Write or extend failing tests**

Add assertions that the main-agent system prompt reflects:
- Daedalus as primary orchestrator
- Worker as assisting execution lane
- Sage for read-only investigation
- Muse for planning
- final synthesis stays in Daedalus

**Step 2: Run tests to verify failure**

Run:
```bash
bun test packages/coding-agent/test/system-prompt.test.ts packages/coding-agent/test/prompt-model-overrides.test.ts
```

Expected: FAIL — old assumptions or wording still dominate

**Step 3: Update the prompt source files minimally**

Do not stuff the delegated subagent contract here.
Only align the main-agent wording with:
- Daedalus-first orchestration
- role boundaries
- parent-side summary-first consumption expectations in principle

**Step 4: Run tests to verify pass**

Run:
```bash
bun test packages/coding-agent/test/system-prompt.test.ts packages/coding-agent/test/prompt-model-overrides.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add \
  packages/coding-agent/src/core/prompts/daedalus-persona.md \
  packages/coding-agent/src/core/prompts/daedalus-constitution.md \
  packages/coding-agent/src/core/prompts/daedalus-overrides-claude.md \
  packages/coding-agent/src/core/prompts/daedalus-overrides-gpt.md \
  packages/coding-agent/test/system-prompt.test.ts \
  packages/coding-agent/test/prompt-model-overrides.test.ts
git commit -m "feat: align main-agent prompt sources with redesign"
```

---

## Task 4: Introduce runtime overlay slots in subagent prompt assembly

**Objective:** Make subagent prompt assembly support execution-mode-specific overlays instead of embedding everything in static prompt files.

**Files:**
- Modify: `packages/coding-agent/src/core/subagents/subagent-system-prompt.ts`
- Modify: `packages/coding-agent/src/core/subagents/runtime-config.ts`
- Modify: `packages/coding-agent/src/core/subagents/resource-loader.ts`
- Modify: `packages/coding-agent/src/core/subagents/subagent-base-contract.md`
- Test: `packages/coding-agent/test/subagent-system-prompt.test.ts`
- Test: `packages/coding-agent/test/prompt-templates.test.ts`

**Step 1: Write failing test for overlay composition**

Add assertions that a subagent system prompt can include:
- base contract
- role prompt
- override prompt
- delegated execution overlay
- task packet

without editing the static role file itself.

**Step 2: Run test to verify failure**

Run:
```bash
bun test packages/coding-agent/test/subagent-system-prompt.test.ts packages/coding-agent/test/prompt-templates.test.ts
```

Expected: FAIL — no overlay slot or incorrect ordering

**Step 3: Add overlay support**

Refactor `buildSubagentSystemPrompt()` and related config plumbing so prompt assembly can accept additional runtime overlay blocks explicitly.

**Step 4: Keep ordering deterministic**

Final ordering should be explicit and stable, e.g.:
1. base contract
2. role prompt
3. model override prompt
4. execution-mode overlay(s)
5. delegated packet

**Step 5: Run tests to verify pass**

Run:
```bash
bun test packages/coding-agent/test/subagent-system-prompt.test.ts packages/coding-agent/test/prompt-templates.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add \
  packages/coding-agent/src/core/subagents/subagent-system-prompt.ts \
  packages/coding-agent/src/core/subagents/runtime-config.ts \
  packages/coding-agent/src/core/subagents/resource-loader.ts \
  packages/coding-agent/src/core/subagents/subagent-base-contract.md \
  packages/coding-agent/test/subagent-system-prompt.test.ts \
  packages/coding-agent/test/prompt-templates.test.ts
git commit -m "feat: add runtime overlay slots to subagent prompt assembly"
```

---

## Task 5: Implement delegated-subagent result envelope overlay

**Objective:** Inject the universal JSON envelope contract at runtime for delegated subagents.

**Files:**
- Modify: `packages/coding-agent/src/core/subagents/runtime-config.ts`
- Modify: `packages/coding-agent/src/core/subagents/subagent-system-prompt.ts`
- Modify: `packages/coding-agent/src/core/subagents/task-packet.ts`
- Test: `packages/coding-agent/test/subagent-system-prompt.test.ts`
- Test: `packages/coding-agent/test/suite/agent-session-prompt.test.ts`

**Step 1: Write failing test for delegated output contract**

Add assertions that delegated Sage/Muse/Worker prompts explicitly instruct the model to finish with:

```json
{
  "task": "...",
  "status": "completed | partial | blocked",
  "summary": "...",
  "output": "..."
}
```

and that they distinguish:
- `summary` = short parent/UI-facing conclusion
- `output` = fuller deferred body

**Step 2: Run test to verify failure**

Run:
```bash
bun test packages/coding-agent/test/subagent-system-prompt.test.ts packages/coding-agent/test/suite/agent-session-prompt.test.ts
```

Expected: FAIL

**Step 3: Add the delegated-subagent overlay text**

Inject a runtime-built block, not a static-prompt rewrite, that specifies:
- exact required envelope fields
- summary vs output semantics
- parent sees summary-first reference by default

**Step 4: Run tests to verify pass**

Run:
```bash
bun test packages/coding-agent/test/subagent-system-prompt.test.ts packages/coding-agent/test/suite/agent-session-prompt.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add \
  packages/coding-agent/src/core/subagents/runtime-config.ts \
  packages/coding-agent/src/core/subagents/subagent-system-prompt.ts \
  packages/coding-agent/src/core/subagents/task-packet.ts \
  packages/coding-agent/test/subagent-system-prompt.test.ts \
  packages/coding-agent/test/suite/agent-session-prompt.test.ts
git commit -m "feat: add delegated subagent result envelope overlay"
```

---

## Task 6: Add Daedalus parent-consumption overlay

**Objective:** Teach Daedalus at runtime how to consume summary-first subagent references and when to inspect full output.

**Files:**
- Modify: `packages/coding-agent/src/core/system-prompt.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/orchestrator-prompt.ts`
- Test: `packages/coding-agent/test/system-prompt.test.ts`
- Test: `packages/coding-agent/test/subagent-system-prompt.test.ts`

**Step 1: Write failing test**

Assert the parent/orchestrator guidance includes:
- subagents return lightweight references
- use `summary` first
- if deeper detail is needed, use `read_agent_result_output(result_id)`
- do not blindly relay child `output`

**Step 2: Run test to verify failure**

Run:
```bash
bun test packages/coding-agent/test/system-prompt.test.ts packages/coding-agent/test/subagent-system-prompt.test.ts
```

Expected: FAIL

**Step 3: Update orchestration guidance**

Modify Daedalus-facing runtime prompt assembly and orchestrator guidance so parent behavior is explicit.

**Step 4: Run tests to verify pass**

Run:
```bash
bun test packages/coding-agent/test/system-prompt.test.ts packages/coding-agent/test/subagent-system-prompt.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add \
  packages/coding-agent/src/core/system-prompt.ts \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/orchestrator-prompt.ts \
  packages/coding-agent/test/system-prompt.test.ts \
  packages/coding-agent/test/subagent-system-prompt.test.ts
git commit -m "feat: teach daedalus summary-first subagent result consumption"
```

---

## Task 7: Replace submit-result payload with universal envelope validation

**Objective:** Move subagent completion from ad hoc payload handling to the universal envelope contract.

**Files:**
- Modify: `packages/coding-agent/src/core/subagents/submit-result-tool.ts`
- Modify: `packages/coding-agent/src/core/subagents/types.ts`
- Modify: `packages/coding-agent/src/core/subagents/result-validation.ts`
- Modify: `packages/coding-agent/src/core/subagents/runner.ts`
- Modify: `packages/ai/src/utils/validation.ts`
- Test: `packages/coding-agent/test/subagent-deliverable-contract.test.ts`
- Test: `packages/coding-agent/test/subagents-result-validation.test.ts`
- Test: `packages/ai/test/validation.test.ts`

**Step 1: Write failing tests**

Add tests for:
- valid universal envelope accepted
- stringified JSON repaired
- invalid status rejected or repaired safely
- malformed envelope degrades safely

**Step 2: Run tests to verify failure**

Run:
```bash
bun test \
  packages/coding-agent/test/subagent-deliverable-contract.test.ts \
  packages/coding-agent/test/subagents-result-validation.test.ts \
  packages/ai/test/validation.test.ts
```

Expected: FAIL

**Step 3: Update submit-result contract**

Make the subagent completion path treat the final structured result as the universal envelope rather than an open-ended deliverable.

**Step 4: Update validator**

Use `result-validation.ts` plus any needed helpers in `packages/ai/src/utils/validation.ts` to:
- parse
- normalize
- repair if safe
- report clear errors if not

**Step 5: Run tests to verify pass**

Run:
```bash
bun test \
  packages/coding-agent/test/subagent-deliverable-contract.test.ts \
  packages/coding-agent/test/subagents-result-validation.test.ts \
  packages/ai/test/validation.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add \
  packages/coding-agent/src/core/subagents/submit-result-tool.ts \
  packages/coding-agent/src/core/subagents/types.ts \
  packages/coding-agent/src/core/subagents/result-validation.ts \
  packages/coding-agent/src/core/subagents/runner.ts \
  packages/ai/src/utils/validation.ts \
  packages/coding-agent/test/subagent-deliverable-contract.test.ts \
  packages/coding-agent/test/subagents-result-validation.test.ts \
  packages/ai/test/validation.test.ts
git commit -m "feat: validate universal subagent result envelope"
```

---

## Task 8: Store full subagent results as sidecar artifacts keyed by result_id

**Objective:** Persist the full result body separately from parent context.

**Files:**
- Modify: `packages/coding-agent/src/core/subagents/artifacts.ts`
- Modify: `packages/coding-agent/src/core/subagents/persisted-runs.ts`
- Modify: `packages/coding-agent/src/core/subagents/types.ts`
- Modify: `packages/coding-agent/src/core/subagents/runner.ts`
- Modify: `packages/coding-agent/src/core/subagents/registry.ts`
- Test: `packages/coding-agent/test/subagents-artifacts.test.ts`
- Test: `packages/coding-agent/test/subagents-persisted-runs.test.ts`

**Step 1: Write failing tests**

Add tests that require:
- a stable `result_id`
- persisted sidecar record containing full envelope
- persisted metadata includes `conversation_id`
- persisted run list can load the new fields

**Step 2: Run tests to verify failure**

Run:
```bash
bun test packages/coding-agent/test/subagents-artifacts.test.ts packages/coding-agent/test/subagents-persisted-runs.test.ts
```

Expected: FAIL

**Step 3: Extend types and artifact paths**

Add explicit result-sidecar semantics to the subagent types and persistence layer.

**Step 4: Persist the full record**

Make the runner write the full normalized subagent record keyed by `result_id` while preserving compatibility with existing `*.meta.json` / `*.result.json` scheme if possible.

**Step 5: Run tests to verify pass**

Run:
```bash
bun test packages/coding-agent/test/subagents-artifacts.test.ts packages/coding-agent/test/subagents-persisted-runs.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add \
  packages/coding-agent/src/core/subagents/artifacts.ts \
  packages/coding-agent/src/core/subagents/persisted-runs.ts \
  packages/coding-agent/src/core/subagents/types.ts \
  packages/coding-agent/src/core/subagents/runner.ts \
  packages/coding-agent/src/core/subagents/registry.ts \
  packages/coding-agent/test/subagents-artifacts.test.ts \
  packages/coding-agent/test/subagents-persisted-runs.test.ts
git commit -m "feat: persist subagent result sidecar artifacts"
```

---

## Task 9: Inject only lightweight summary references into parent context

**Objective:** Ensure the parent sees `result_id`, `conversation_id`, `task`, `status`, `summary`, and the tool note — but not full `output`.

**Files:**
- Modify: `packages/coding-agent/src/core/agent-session.ts`
- Modify: `packages/coding-agent/src/core/messages.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/shared/persistence.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/index.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/task-progress-renderer.ts`
- Test: `packages/coding-agent/test/agent-session-dynamic-tools.test.ts`
- Test: `packages/coding-agent/test/subagents-starter-pack.test.ts`

**Step 1: Write failing tests**

Add assertions that after subagent completion the parent-visible content includes:
- `result_id`
- `conversation_id`
- `task`
- `status`
- `summary`
- a note saying to use `read_agent_result_output(result_id)`

and does **not** include full `output` by default.

**Step 2: Run tests to verify failure**

Run:
```bash
bun test packages/coding-agent/test/agent-session-dynamic-tools.test.ts packages/coding-agent/test/subagents-starter-pack.test.ts
```

Expected: FAIL

**Step 3: Change parent injection behavior**

Update the runtime so the parent receives only the lightweight reference record.

**Step 4: Update visible render behavior**

Make the visible subagent result rendering use only summary-first content by default.

**Step 5: Run tests to verify pass**

Run:
```bash
bun test packages/coding-agent/test/agent-session-dynamic-tools.test.ts packages/coding-agent/test/subagents-starter-pack.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add \
  packages/coding-agent/src/core/agent-session.ts \
  packages/coding-agent/src/core/messages.ts \
  packages/coding-agent/src/extensions/daedalus/shared/persistence.ts \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/index.ts \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/task-progress-renderer.ts \
  packages/coding-agent/test/agent-session-dynamic-tools.test.ts \
  packages/coding-agent/test/subagents-starter-pack.test.ts
git commit -m "feat: inject summary-first subagent references into parent context"
```

---

## Task 10: Add `read_agent_result_output(result_id)` tool

**Objective:** Create the narrow drill-down tool for deferred full result bodies.

**Files:**
- Create: `packages/coding-agent/src/extensions/daedalus/tools/read-agent-result-output.ts`
- Create: `packages/coding-agent/src/extensions/daedalus/tools/agent-result-store.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/bundle.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/index.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/tools.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/tools/dynamic-tools.ts`
- Modify: `packages/coding-agent/src/core/subagents/persisted-runs.ts`
- Test: `packages/coding-agent/test/subagents-extension-api.test.ts`
- Test: `packages/coding-agent/test/subagents-artifacts.test.ts`
- Test: `packages/coding-agent/test/agent-session-dynamic-tools.test.ts`

**Step 1: Write failing tests**

Add tests for:
- successful lookup by `result_id`
- returned fields are exactly:
  - `result_id`
  - `conversation_id`
  - `status`
  - `output`
- clear error on missing/stale result

**Step 2: Run tests to verify failure**

Run:
```bash
bun test \
  packages/coding-agent/test/subagents-extension-api.test.ts \
  packages/coding-agent/test/subagents-artifacts.test.ts \
  packages/coding-agent/test/agent-session-dynamic-tools.test.ts
```

Expected: FAIL

**Step 3: Implement storage accessor helper**

Create `agent-result-store.ts` as the small internal retrieval layer that resolves `result_id` against sidecar storage.

**Step 4: Implement the tool**

Create `read-agent-result-output.ts` and wire it into the Daedalus extension bundle.

**Step 5: Run tests to verify pass**

Run:
```bash
bun test \
  packages/coding-agent/test/subagents-extension-api.test.ts \
  packages/coding-agent/test/subagents-artifacts.test.ts \
  packages/coding-agent/test/agent-session-dynamic-tools.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add \
  packages/coding-agent/src/extensions/daedalus/tools/read-agent-result-output.ts \
  packages/coding-agent/src/extensions/daedalus/tools/agent-result-store.ts \
  packages/coding-agent/src/extensions/daedalus/bundle.ts \
  packages/coding-agent/src/extensions/daedalus/index.ts \
  packages/coding-agent/src/extensions/daedalus/tools/tools.ts \
  packages/coding-agent/src/extensions/daedalus/tools/dynamic-tools.ts \
  packages/coding-agent/src/core/subagents/persisted-runs.ts \
  packages/coding-agent/test/subagents-extension-api.test.ts \
  packages/coding-agent/test/subagents-artifacts.test.ts \
  packages/coding-agent/test/agent-session-dynamic-tools.test.ts
git commit -m "feat: add deferred subagent result output read tool"
```

---

## Task 11: Migrate bundled role registry to Sage / Muse / Worker

**Objective:** Replace Scout / Planner / Reviewer in the runtime registry with Sage / Muse / Worker while preserving verification behavior.

**Files:**
- Modify: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/bundled.ts`
- Modify: `packages/coding-agent/src/core/subagents/policy.ts`
- Modify: `packages/coding-agent/src/core/subagents/discovery.ts`
- Modify: `packages/coding-agent/src/core/subagents/types.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/orchestrator-prompt.ts`
- Modify or deprecate: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/scout.md`
- Modify or deprecate: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/planner.md`
- Modify or deprecate: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/reviewer.md`
- Test: `packages/coding-agent/test/role-aware-performance-tuning.test.ts`
- Test: `packages/coding-agent/test/subagents-policy.test.ts`
- Test: `packages/coding-agent/test/subagents-runtime-config.test.ts`

**Step 1: Write failing tests**

Add assertions that:
- bundled runtime roles are Sage / Muse / Worker
- Sage is read-only research/recon
- Muse is planning-only
- Worker remains bounded execution
- reviewer behavior still exists via policy rather than registry role

**Step 2: Run tests to verify failure**

Run:
```bash
bun test \
  packages/coding-agent/test/role-aware-performance-tuning.test.ts \
  packages/coding-agent/test/subagents-policy.test.ts \
  packages/coding-agent/test/subagents-runtime-config.test.ts
```

Expected: FAIL

**Step 3: Update bundled registry and tool policies**

Modify the runtime registry so it exports the new role set.

**Step 4: Keep Worker but update doctrine**

Do not rename Worker. Update only the runtime behavior/policies and role metadata.

**Step 5: Run tests to verify pass**

Run:
```bash
bun test \
  packages/coding-agent/test/role-aware-performance-tuning.test.ts \
  packages/coding-agent/test/subagents-policy.test.ts \
  packages/coding-agent/test/subagents-runtime-config.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/bundled.ts \
  packages/coding-agent/src/core/subagents/policy.ts \
  packages/coding-agent/src/core/subagents/discovery.ts \
  packages/coding-agent/src/core/subagents/types.ts \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/orchestrator-prompt.ts \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/scout.md \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/planner.md \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/reviewer.md \
  packages/coding-agent/test/role-aware-performance-tuning.test.ts \
  packages/coding-agent/test/subagents-policy.test.ts \
  packages/coding-agent/test/subagents-runtime-config.test.ts
git commit -m "feat: migrate bundled role registry to sage muse worker"
```

---

## Task 12: Wire `conversation_id`-based subagent continuation

**Objective:** Make `conversation_id` functional for resumed subagent sessions instead of passive metadata.

**Files:**
- Modify: `packages/coding-agent/src/core/agent-session.ts`
- Modify: `packages/coding-agent/src/core/subagents/runner.ts`
- Modify: `packages/coding-agent/src/core/subagents/types.ts`
- Modify: `packages/coding-agent/src/core/subagents/persisted-runs.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/session-link.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/inspect.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/inspector.ts`
- Modify: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/viewer.ts`
- Test: `packages/coding-agent/test/subagents-runner.test.ts`
- Test: `packages/coding-agent/test/subagents-persisted-runs.test.ts`
- Test: `packages/coding-agent/test/subagents-extension-api.test.ts`

**Step 1: Write failing tests**

Add tests for:
- parent can resume a prior subagent session using `conversation_id`
- resumed subagents get resumed-mode overlay behavior
- result lookup and session continuation remain separate concepts

**Step 2: Run tests to verify failure**

Run:
```bash
bun test \
  packages/coding-agent/test/subagents-runner.test.ts \
  packages/coding-agent/test/subagents-persisted-runs.test.ts \
  packages/coding-agent/test/subagents-extension-api.test.ts
```

Expected: FAIL

**Step 3: Implement continuation plumbing**

Modify the runner/session integration so a prior child session can be resumed explicitly.

**Step 4: Update inspector/session-link helpers**

Make sure inspection surfaces expose and navigate resumed sessions correctly.

**Step 5: Run tests to verify pass**

Run:
```bash
bun test \
  packages/coding-agent/test/subagents-runner.test.ts \
  packages/coding-agent/test/subagents-persisted-runs.test.ts \
  packages/coding-agent/test/subagents-extension-api.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add \
  packages/coding-agent/src/core/agent-session.ts \
  packages/coding-agent/src/core/subagents/runner.ts \
  packages/coding-agent/src/core/subagents/types.ts \
  packages/coding-agent/src/core/subagents/persisted-runs.ts \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/session-link.ts \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/inspect.ts \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/inspector.ts \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/viewer.ts \
  packages/coding-agent/test/subagents-runner.test.ts \
  packages/coding-agent/test/subagents-persisted-runs.test.ts \
  packages/coding-agent/test/subagents-extension-api.test.ts
git commit -m "feat: add conversation-based subagent continuation"
```

---

## Task 13: Run full redesign regression suite

**Objective:** Prove the redesign with focused tests before cleanup.

**Files:**
- Test: `packages/coding-agent/test/subagent-system-prompt.test.ts`
- Test: `packages/coding-agent/test/system-prompt.test.ts`
- Test: `packages/coding-agent/test/prompt-model-overrides.test.ts`
- Test: `packages/coding-agent/test/prompt-templates.test.ts`
- Test: `packages/coding-agent/test/suite/agent-session-prompt.test.ts`
- Test: `packages/coding-agent/test/subagents-runner.test.ts`
- Test: `packages/coding-agent/test/subagent-deliverable-contract.test.ts`
- Test: `packages/coding-agent/test/subagents-result-validation.test.ts`
- Test: `packages/coding-agent/test/subagents-artifacts.test.ts`
- Test: `packages/coding-agent/test/subagents-persisted-runs.test.ts`
- Test: `packages/coding-agent/test/agent-session-dynamic-tools.test.ts`
- Test: `packages/coding-agent/test/role-aware-performance-tuning.test.ts`
- Test: `packages/coding-agent/test/subagents-policy.test.ts`
- Test: `packages/coding-agent/test/subagents-discovery.test.ts`
- Test: `packages/coding-agent/test/subagents-runtime-config.test.ts`
- Test: `packages/coding-agent/test/subagents-settings.test.ts`
- Test: `packages/coding-agent/test/subagents-starter-pack.test.ts`
- Test: `packages/coding-agent/test/subagent-base-contract.test.ts`
- Test: `packages/coding-agent/test/subagent-override-selector.test.ts`
- Test: `packages/ai/test/validation.test.ts`

**Step 1: Run the redesign-focused test suite**

Run:
```bash
bun test \
  packages/coding-agent/test/subagent-system-prompt.test.ts \
  packages/coding-agent/test/system-prompt.test.ts \
  packages/coding-agent/test/prompt-model-overrides.test.ts \
  packages/coding-agent/test/prompt-templates.test.ts \
  packages/coding-agent/test/suite/agent-session-prompt.test.ts \
  packages/coding-agent/test/subagents-runner.test.ts \
  packages/coding-agent/test/subagent-deliverable-contract.test.ts \
  packages/coding-agent/test/subagents-result-validation.test.ts \
  packages/coding-agent/test/subagents-artifacts.test.ts \
  packages/coding-agent/test/subagents-persisted-runs.test.ts \
  packages/coding-agent/test/agent-session-dynamic-tools.test.ts \
  packages/coding-agent/test/role-aware-performance-tuning.test.ts \
  packages/coding-agent/test/subagents-policy.test.ts \
  packages/coding-agent/test/subagents-discovery.test.ts \
  packages/coding-agent/test/subagents-runtime-config.test.ts \
  packages/coding-agent/test/subagents-settings.test.ts \
  packages/coding-agent/test/subagents-starter-pack.test.ts \
  packages/coding-agent/test/subagent-base-contract.test.ts \
  packages/coding-agent/test/subagent-override-selector.test.ts \
  packages/ai/test/validation.test.ts
```

Expected: PASS

**Step 2: Run targeted integration sanity**

Run:
```bash
bun test packages/coding-agent/test/status-dashboard.test.ts packages/coding-agent/test/tool-state-migration.test.ts
```

Expected: PASS

**Step 3: Record any remaining unrelated repo-wide debt**

If `bun run check` is still not green because of unrelated failures, note that explicitly rather than blocking this redesign slice.

**Step 4: Commit**

```bash
git add packages/coding-agent/test packages/ai/test
git commit -m "test: cover agent system redesign end-to-end"
```

---

## Task 14: Cleanup old-role runtime assumptions

**Objective:** Remove stale old-architecture remnants once the new system is verified.

**Files:**
- Modify or delete: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/scout.md`
- Modify or delete: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/planner.md`
- Modify or delete: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents/reviewer.md`
- Modify or delete: old override files for scout/planner/reviewer
- Modify: `packages/coding-agent/src/extensions/daedalus/workflow/subagents/bundled.ts`
- Modify: `docs/Forge-Daedalus port/agent-role-redesign/current-state-and-next-steps.md`
- Modify: `docs/Forge-Daedalus port/implementation-status.md`

**Step 1: Remove stale runtime references**

Delete or de-register old-role runtime files only after tests are green.

**Step 2: Update docs to match runtime truth**

Mark the redesign as runtime-adopted where appropriate and note any remaining open tracks.

**Step 3: Run final focused sanity tests**

Run:
```bash
bun test packages/coding-agent/test/subagents-discovery.test.ts packages/coding-agent/test/role-aware-performance-tuning.test.ts
```

Expected: PASS

**Step 4: Commit**

```bash
git add \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/bundled.ts \
  packages/coding-agent/src/extensions/daedalus/workflow/subagents/agents \
  "docs/Forge-Daedalus port/agent-role-redesign/current-state-and-next-steps.md" \
  "docs/Forge-Daedalus port/implementation-status.md"
git commit -m "chore: remove obsolete old-role runtime assumptions"
```

---

## Final completion checklist

- [ ] Daedalus is primary-only
- [ ] Sage / Muse / Worker are the runtime specialist roles
- [ ] Reviewer behavior survives through policy, not mandatory role identity
- [ ] static prompts remain role-focused and reviewable
- [ ] runtime overlays handle delegated execution contracts
- [ ] delegated subagents return the universal JSON envelope
- [ ] full results are stored as sidecar artifacts keyed by `result_id`
- [ ] parent context gets summary-first lightweight references only
- [ ] `read_agent_result_output(result_id)` works
- [ ] `conversation_id` supports continuation
- [ ] redesign-focused tests pass

## Execution handoff

Plan complete and saved. Ready to execute using subagent-driven-development — I'll dispatch a fresh subagent per task with two-stage review (spec compliance then code quality). Shall I proceed?