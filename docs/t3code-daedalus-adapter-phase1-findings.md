# t3code Daedalus Adapter Phase 1 Findings

> Findings from Phase 1 implementation work in `/home/likas/Research/gui-inspiration/t3code` on branch `daedalus-adapter-phase-1`.

## Executive summary

Phase 1 established the minimum useful Daedalus provider path inside t3code: Daedalus can be represented in settings/contracts, registered as a built-in provider driver, connected through server-side adapter/provider layers, translated into t3code stream events, and covered by focused tests plus typechecks.

The implementation is intentionally narrow. It proves the adapter seam and basic provider lifecycle, but it does **not** yet prove full real-world Daedalus GUI compatibility. Manual smoke/integration validation against a live Daedalus RPC endpoint remains the key follow-up before treating the adapter as user-ready.

## Completed work

### Contracts and settings

Phase 1 added Daedalus support to t3code contracts/settings surfaces:

- Daedalus settings schema and defaults.
- Patch support for Daedalus settings.
- Required default values so the web/server settings paths can typecheck with the new provider fields.

### Server provider implementation

Phase 1 added the server-side pieces required for a selectable Daedalus provider:

- Daedalus provider constants.
- Daedalus event translator.
- Daedalus RPC client.
- Provider snapshot helpers.
- Text-generation fallback behavior.
- Adapter lifecycle handling.
- Built-in Daedalus driver registration.

Together, these pieces cover the basic lifecycle expected by t3code's provider system: register the provider, resolve settings, connect/manage adapter state, stream translated events, surface snapshots/status, and fall back appropriately in text-generation paths.

### Web fixture/default update

The web app required an additional default update after the settings schema changed:

- Added Daedalus defaults to the keybindings toast fixture so `apps/web` typechecking succeeds with the required settings shape.

## Verification results

### Contracts

Passed:

- `bun run test src/settings.test.ts`
  - 8 tests passed.
- `bun run typecheck`

### Server

Focused server tests passed:

| Area | Tests |
| --- | ---: |
| EventTranslator | 7 |
| RpcClient | 6 |
| Provider | 7 |
| TextGeneration | 6 |
| Adapter | 8 |
| Driver | 3 |
| **Total** | **37** |

Additional server verification:

- `bun run typecheck` passed.
- The command emitted pre-existing Effect diagnostic messages, but completed with no type errors.

### Web

Passed:

- `bun run typecheck`

This passed after adding the Daedalus defaults to the keybindings toast fixture.

### Root workspace

Passed:

- `bun run typecheck`

Turbo result:

- 12 successful / 12 total.

Notes:

- Existing Effect diagnostic messages appeared in unrelated packages/files.
- No typecheck errors were reported.

## Manual validation status

Manual smoke testing was **not run** in this headless execution.

Remaining validation step:

- Run a live t3code + Daedalus smoke/integration test against the real Daedalus RPC protocol before declaring the adapter user-ready.

## Phase 1 limitations

Phase 1 intentionally stops short of full Daedalus feature parity. Known limitations:

- No approvals bridging.
- No skills, plans, subagents, diffs, resume, or checkpoint support.
- Custom model discovery only covers configured custom models.
- Commit/PR generation is unsupported.
- Event union is intentionally narrow.
- Real Daedalus RPC protocol compatibility still needs smoke/integration validation.

## Recommendations for Phase 2

Recommended next work:

1. **Real RPC contract smoke**
   - Validate the adapter against a live Daedalus RPC endpoint.
   - Confirm request/response shapes, streaming semantics, cancellation behavior, and error handling.

2. **Approvals and user-input bridge**
   - Add a path for Daedalus-owned approval/user-input prompts to appear in t3code without moving policy ownership into t3code.

3. **Timeline, diff, and tool payload fidelity**
   - Expand event translation beyond the narrow Phase 1 union.
   - Preserve enough structure for high-quality tool timelines, file edits, diffs, and activity panels.

4. **Resumable sessions and checkpoints**
   - Map t3code project/thread identity to durable Daedalus sessions.
   - Add resume/checkpoint awareness without duplicating Daedalus runtime state.

5. **Model discovery and status probe hardening**
   - Broaden model discovery beyond configured custom models where appropriate.
   - Harden provider snapshot/status probes for unavailable, misconfigured, or partially available Daedalus runtimes.

## Overall assessment

Phase 1 completed the adapter foundation and verified it with focused tests plus workspace typechecks. The branch is a good basis for Phase 2 planning, with the main risk concentrated around unproven live Daedalus RPC compatibility and missing higher-fidelity Daedalus UX features such as approvals, diffs, resumability, and richer event timelines.
