# Deep Dive: Tool-Call Robustness and Schema Coercion

Status: deep-dive draft
Priority: Very High

## Why this matters

Even excellent prompts fail if tool calls are brittle.
Tool-call robustness directly affects performance by reducing:
- failed calls
- malformed arguments
- schema mismatches
- wasted turns spent recovering from formatting issues

This is especially important when supporting multiple providers and models with varying function-calling quality.

## Forge mechanism

Forge has explicit attention to malformed/stringified tool call handling and schema coercion.

Key references:
- `harnesses/forgecode/crates/forge_domain/tests/test_stringified_tool_calls.rs`
- `harnesses/forgecode/crates/forge_json_repair/...`

Observed takeaway:
- Forge treats tool-call repair/coercion as a first-class reliability problem
- robustness is tested, not assumed

## Why it likely improves performance

This improves:
- successful tool execution rate
- provider/model portability
- fewer recovery turns
- lower friction when prompts/tool schemas evolve

## Current Daedalus state

Daedalus has a strong tool ecosystem, but this area should be explicitly audited from a robustness perspective.
The question is not whether tool calling works in ideal cases.
The question is how well it degrades under messy outputs.

## Port thesis

Daedalus should explicitly harden tool-call ingestion and validation, especially for:
- stringified argument objects
- partially malformed JSON
- provider-specific schema quirks
- small naming mismatches / recoverable coercions

## Candidate robustness layers

1. Argument repair
- recover stringified JSON arguments
- normalize common wrapper forms

2. Schema coercion
- coerce compatible scalar/array forms where safe
- normalize enums/casing where safe

3. Better diagnostics
- clearer error feedback to the model
- identify recoverable vs non-recoverable failures

4. Tests for bad-call cases
- regression suite across providers/model families

## Design questions

1. How aggressive should coercion be before it becomes dangerous?
2. Which tools should allow repair/coercion and which should remain strict?
3. Should Daedalus log repair events for debugging and evaluation?
4. Should repaired calls be surfaced to the model or kept transparent?

## Recommended implementation phases

### Phase 1
- audit current robustness behavior
- add tests for malformed/stringified tool arguments

### Phase 2
- implement safe repair/coercion paths
- improve error classification and messaging

### Phase 3
- measure provider/model-specific failure reduction

## Success criteria

- fewer tool-call failures from recoverable formatting issues
- fewer wasted recovery turns
- better portability across provider/model variants
- higher effective task throughput under imperfect function-calling conditions
