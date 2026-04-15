# IntentGate v2

Status: implemented.

## Goal

IntentGate now has two layers:

1. **Prompt contract**
   - every assistant turn begins with one visible line:

```text
Intent: <research|planning|implementation|investigation|evaluation|fix|open-ended> — <brief approach>
```

2. **Harness runtime feature**
   - Daedalus parses the visible line
   - records per-turn intent metadata
   - exposes that metadata to the SDK and extensions
   - enforces mutation policy for built-in mutation tools

Example:

```text
Intent: planning — inspect context and write plan docs only.
```

## Intent classes

Allowed classes:
- `research`
- `planning`
- `implementation`
- `investigation`
- `evaluation`
- `fix`
- `open-ended`

## Routing rules

Before selecting the final intent class, the assistant should:
- identify the user's **surface form**
- infer the likely **true intent**
- choose the visible intent line from the **true intent**

Conservative routing rules:
- `research`: inspect and explain only
- `planning`: inspect context and write/update planning markdown only
- `investigation`: inspect and report only unless the user explicitly asked to resolve it
- `evaluation`: assess and propose only unless the user explicitly asked to execute
- `fix`: diagnose first, then make the smallest correct change
- `implementation`: inspect relevant context first, then implement
- `open-ended`: inspect first; ask one clarifying question only if needed

If the user explicitly asked for read-only behavior, no changes, or explanation only, that overrides everything else.

## Mutation scopes

IntentGate v2 derives a mutation scope from the final intent:
- `none`
- `docs-only`
- `code-allowed`

Current mapping:
- `research` → `none`
- `planning` → `docs-only`
- `investigation` → `none`
- `evaluation` → `none`
- `fix` → `code-allowed`
- `implementation` → `code-allowed`
- `open-ended` → `code-allowed`
- explicit read-only/no-change override → `none`

## Planning artifact policy

Planning intent may mutate markdown files only.

Allowed planning locations:
- `docs/`
- `plans/`
- `specs/`
- `design/`

Allowed root exceptions:
- `README.md`
- `AGENTS.md`
- `CLAUDE.md`

Daedalus may create the top-level planning directories above when writing a new planning artifact.

Suggested routing by artifact kind:
- `docs` → `docs/`
- `plan` → `plans/`
- `spec` → `specs/`
- `design` → `design/`

Default fallback when unsure:
- `plans/`

## Runtime behavior

The runtime now seeds a provisional intent from the current user message before tool execution, then refines it when the visible assistant `Intent:` line arrives. It stores metadata like:
- `surfaceForm`
- `trueIntent`
- `approach`
- `readOnly`
- `mutationScope`
- `planningArtifactKind`
- `source`
- `valid`

That metadata is:
- available during the current turn before the first mutation tool call
- refined by the visible `Intent:` line later in the same turn
- persisted to the session as `intent` entries
- available to SDK callers and extensions

## Tool policy hooks

IntentGate v2 enforces policy for built-in mutation tools:
- `write`
- `edit`
- `hashline_edit`
- `ast_edit`

Current behavior:
- `none` scope blocks mutation tools and only allows clearly read-only `bash` commands
- `docs-only` scope allows only planning-safe markdown writes/edits in the planning allowlist, plus read-only `bash` and safe `mkdir` for planning directories
- `code-allowed` scope allows normal mutation

Planning `write` calls are auto-routed into the planning allowlist when the assistant picks an invalid markdown path. Planning `edit` / `hashline_edit` remain strict and block invalid paths with a suggested safe destination.

`ast_edit` is blocked for planning intent.

## SDK/runtime options

`createAgentSession()` accepts:

```ts
intentGate?: {
  parseVisibleLine?: boolean;
  persistMetadata?: boolean;
  toolPolicyMode?: "off" | "warn" | "enforce";
}
```

Default behavior in v2:
- `parseVisibleLine: true`
- `persistMetadata: true`
- `toolPolicyMode: "enforce"`

## Prompt override behavior

- default prompt: includes IntentGate
- append-only customization: keeps IntentGate
- full system prompt override: replaces default prompt, so users must add their own IntentGate line contract if they still want parsing and enforcement to work reliably

If a custom prompt omits the visible `Intent:` line and tool policy enforcement remains enabled, mutation tools can be blocked because no valid intent line was parsed.
