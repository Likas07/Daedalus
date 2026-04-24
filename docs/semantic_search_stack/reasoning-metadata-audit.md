# Reasoning metadata audit

Phase 3 Forge parity needs compaction to preserve the latest non-empty reasoning metadata from messages that are summarized away and expose it to the first remaining assistant message that lacks reasoning.

Daedalus currently stores reasoning-continuation data in these places:

- `packages/ai/src/types.ts`
  - `AssistantMessage.content[]` can include `ThinkingContent` blocks: `{ type: "thinking", thinking: string, thinkingSignature?: string, redacted?: boolean }`.
  - `thinkingSignature` carries provider-specific continuation data. For redacted/safety-filtered reasoning, `redacted: true` marks that the opaque encrypted payload is stored in `thinkingSignature`.
  - `ToolCall.thoughtSignature?: string` carries Google/Gemini-style opaque thought signatures, and OpenAI-compatible reasoning-details can also be serialized onto tool calls by `openai-completions.ts`.
  - `AssistantMessage` does not declare a first-class `reasoning` field or `reasoning_details` field, but providers may attach undeclared provider-specific metadata on the object.

- OpenAI Responses providers
  - `providers/openai-responses.ts` and `providers/azure-openai-responses.ts` request `include: ["reasoning.encrypted_content"]` when reasoning is enabled.
  - `providers/openai-responses-shared.ts` serializes response reasoning items into `ThinkingContent.thinkingSignature` and replays them from thinking blocks on subsequent requests.
  - `providers/openai-codex-responses.ts` also includes `reasoning.encrypted_content`.

- OpenAI-compatible completions
  - `providers/openai-completions.ts` reads streamed `reasoning_details` deltas.
  - It stores reasoning text/signature as `ThinkingContent.thinkingSignature`, stores item-level details on matching `ToolCall.thoughtSignature`, and may attach a top-level undeclared `(assistantMsg as any).reasoning_details` array for replay.

- Anthropic / Bedrock
  - `providers/anthropic.ts` streams `thinking` and signature deltas into `ThinkingContent.thinking` and `thinkingSignature`; redacted thinking uses the signature field for the encrypted payload.
  - `providers/amazon-bedrock.ts` stores reasoning content/signatures in `ThinkingContent` and replays signature-bearing blocks.

- Google / Gemini / Vertex / Gemini CLI
  - `providers/google.ts`, `providers/google-vertex.ts`, and `providers/google-gemini-cli.ts` stream thought text/signatures into `ThinkingContent` and `ToolCall.thoughtSignature`.
  - `providers/google-shared.ts` maps `ThinkingContent.thinkingSignature` and `ToolCall.thoughtSignature` back into request `thoughtSignature` parts.

Compaction preservation contract:

- Snapshot the latest assistant message in the compacted range that has any non-empty reasoning metadata.
- Snapshot must include thinking blocks, top-level `reasoning_details`, reasoning/thinking/thought provider-specific object fields, and tool-call `thoughtSignature` values.
- Inject the snapshot into the first post-compaction assistant message that has no reasoning metadata.
- Injection is idempotent: if the same snapshot is already present anywhere in the post-compaction context, do not inject it again into another assistant.
