---
name: executing-plans
description: Helps execute a written implementation plan, choose an execution strategy for each task, and keep review checkpoints. If relevant, use the questionnaire tool to ask whether the user wants to load this skill before reading it.
---

# Executing Plans

## Overview

Load the plan, review it critically, choose the right execution mode for each task, then complete the work and report back.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**Core principle:** The plan constrains what to build and how to verify it. You decide how to execute each task. Do simple, local work yourself. Use subagents when fresh context, delegation, or parallelism will improve quality or speed. Keep control of coordination, verification, and final judgment.

## The Process

### Step 1: Load and Review Plan
1. Read the entire plan file
2. Review critically - identify questions, contradictions, risky assumptions, or missing prerequisites
3. If concerns: Raise them with your human partner before starting
4. If the plan is sound: use the `todo` tool to create one todo item per task, then proceed

### Step 2: Choose Execution Strategy

Before starting each task, choose the lightest-weight approach that preserves quality.

**Do it yourself when:**
- The change is small and local
- The fix is obvious
- Briefing a subagent would cost more than doing the work
- The task touches tightly coupled code that benefits from one person holding it together

**Use one subagent when:**
- The task is larger or more mechanical
- Fresh context would help
- Focused implementation, investigation, or verification can be delegated cleanly
- An independent pass would improve quality

**Use multiple subagents in parallel only when:**
- Tasks are truly independent
- They will not edit the same files or overlapping code paths
- Shared schemas, interfaces, or refactors are not in flight
- You can review and integrate each result safely

Re-evaluate as you go. You may switch strategies mid-plan if the work reveals tighter coupling or new opportunities to parallelize safely.

### Step 3: Execute Tasks

For each task:
1. Identify the next incomplete todo item and treat it as the active task
2. Get the full task text and any needed context
3. Execute using the chosen strategy:
   - **Direct execution:** Follow the steps yourself exactly
   - **Delegated execution:** Give the subagent the exact task text, file paths, constraints, and verification steps
   - **Parallel execution:** Dispatch only independent tasks; keep ownership of integration and conflict resolution
4. Run the required verifications yourself or review concrete evidence that they passed
5. Inspect the result against the plan before accepting it
6. Toggle the corresponding todo item only after implementation and verification both check out

### Step 4: Complete Development

After all tasks complete and verified:
- Announce: "I'm using the finishing-a-development-branch skill to complete this work."
- **REQUIRED SUB-SKILL:** Use finishing-a-development-branch
- Follow that skill to verify tests, present options, execute choice

## Subagent Best Practices

When using subagents:
- Give them the exact task text instead of making them rediscover the plan
- Include only the context they need, plus relevant file paths and constraints
- Tell them what verification they must run
- Review their output before treating the task as done
- Do not send two subagents into the same files at the same time

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (missing dependency, test fails, instruction unclear)
- The plan has critical gaps preventing progress
- You don't understand an instruction
- Verification fails repeatedly
- Delegated or parallel execution reveals conflicts the plan didn't account for

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Your human partner updates the plan based on your feedback
- The fundamental approach needs rethinking
- The chosen execution strategy proves wrong for the task

**Don't force through blockers** - stop and ask.

## Remember
- Review the plan critically first
- Let task complexity decide the execution mode
- Do simple work inline
- Use subagents when they improve focus, speed, or quality
- Parallelize only independent work
- Keep ownership of verification and integration
- Don't skip verifications
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent

## Integration

**Required workflow skills:**
- **writing-plans** - Creates the plan this skill executes
- **finishing-a-development-branch** - Complete development after all tasks
