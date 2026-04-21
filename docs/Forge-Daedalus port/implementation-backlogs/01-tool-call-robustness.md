# Milestone 1 — Tool-Call Robustness Hardening

Status: backlog draft

## Goal
Make Daedalus tool invocation more resilient before introducing richer tool schemas.

## Dependencies
- Milestone 0 design stability

## Tasks

### M1.1 Audit current tool-call ingestion path
Likely files:
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/extensions/runner.ts`
- tool wrapping / schema files under `packages/coding-agent/src/core/tools/`
- provider / model integration code in `packages/ai` and related call sites

Work:
- trace where tool call JSON is parsed and validated
- identify current handling for malformed or stringified arguments
- identify provider/model-specific weak spots

Verification:
- document current failure modes and gaps

### M1.2 Add regression tests for malformed tool-call payloads
Likely test targets:
- `packages/coding-agent/src/**/__tests__/...`
- or existing test dirs under relevant core/tool modules

Test cases:
- stringified object arguments
- enum casing mismatches where safe to normalize
- arrays vs singleton objects where unsafe/safe distinctions matter
- partial/malformed JSON that can be repaired safely

Verification:
- failing tests demonstrate current gaps

### M1.3 Implement safe coercion/repair layer
Likely files:
- provider response normalization layer
- tool dispatch layer
- schema validation helpers

Work:
- support safe repair for recoverable argument shapes
- classify recoverable vs unrecoverable failures
- keep strictness for dangerous operations where coercion would be risky

Verification:
- regression tests pass
- normal tool behavior unchanged

### M1.4 Improve tool-call diagnostics
Likely files:
- tool execution result formatting
- error rendering / UI reporting
- RPC/logging surfaces if applicable

Work:
- produce clearer error messages for invalid arguments
- distinguish repaired-call success from unrecoverable failure
- optionally log coercion/repair events for debugging

Verification:
- diagnostics are inspectable and actionable

## Completion criteria
- recoverable malformed tool calls succeed more often
- regression suite exists for bad-call cases
- richer tools can be added with lower rollout risk
