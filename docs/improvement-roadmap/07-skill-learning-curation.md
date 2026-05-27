# 07. Skill Learning With Curation

## Position

The idea is valuable, but Hermes shows the danger: automatic skill creation can preserve the wrong part of a workflow and create useless clutter.

Daedalus should not auto-create skills from every successful task. It should run a strict curation pipeline.

## Core Rule

No skill is persisted without a quality gate.

Better to miss a possible skill than to create bad procedural memory.

## Product Shape

Add:

```text
/skillify
/skillify last-session
/skillify candidate
/skills pending
/skills approve <id>
/skills reject <id>
```

Skill learning should produce candidates, not committed skills.

## What Makes Something Skill-Worthy

A candidate must pass these checks:

- repeated or likely-to-repeat workflow
- not specific to one file path unless project-local
- includes the value-adding decision, not just incidental commands
- has clear trigger conditions
- has explicit non-triggers
- includes verification steps
- does not duplicate an existing skill
- short enough to load profitably

## Candidate Structure

```ts
interface SkillCandidate {
  id: string;
  sourceSessionId: string;
  proposedName: string;
  scope: "project" | "user";
  triggerSummary: string;
  nonTriggers: string[];
  reusableWorkflow: string;
  verification: string[];
  evidenceRefs: string[];
  duplicateOf?: string;
  confidence: "low" | "medium" | "high";
}
```

## Curation Flow

1. User or agent requests skillification.
2. Daedalus extracts candidate workflows from session evidence.
3. A reviewer pass checks whether the candidate captured the useful part.
4. Candidate is stored under pending skills.
5. User approves, edits, or rejects.
6. Only approved candidates become `SKILL.md`.

## Anti-Patterns To Reject

- "Run `bun test` after changes" as a standalone skill.
- One-off bug workaround with no general trigger.
- Capturing the command but not the diagnostic reasoning.
- Capturing a repo-specific workflow as a global skill.
- Creating a skill that simply repeats existing AGENTS.md instructions.

## Acceptance Criteria

- Skill learning never writes an active skill without approval.
- Candidates include non-triggers.
- Duplicate detection checks existing project and user skills.
- Rejected candidates are recorded to avoid suggesting the same bad skill repeatedly.
- Tests cover useful workflow extraction and useless workflow rejection.
