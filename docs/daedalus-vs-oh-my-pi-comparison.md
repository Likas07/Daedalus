# Daedalus vs Oh My Pi Comparison

Date: 2026-05-26

This comparison is based on the local snapshots inspected during the review:

- Daedalus: `/home/likas/Research/Daedalus`, branch `main`, commit `f3ce90783`, dirty worktree, 94 commits ahead of origin.
- Oh My Pi: `/home/likas/Research/harnesses/oh-my-pi`, branch `main`, commit `7f08b51f2`, clean worktree.

## Executive Read

Oh My Pi is ahead because it has turned "Pi fork" into a complete agent operating system: native fast paths, broad tool surface, LSP/DAP/eval/browser/memory/GitHub/resource schemes, strong docs, release packaging, benchmarks, and visible product proof.

Daedalus is strongest where Oh My Pi is weaker or less central: GUI/app-server/desktop direction, durable project/thread/worktree concepts, semantic-search ambition, and extension/role workflow ideas. But Daedalus currently feels like a strong research fork plus GUI platform, while Oh My Pi feels like a daily-driver coding agent.

## Scorecard

| Area | Oh My Pi | Daedalus | Gap |
|---|---:|---:|---|
| Core agent tools | Very high | Medium | OMP has roughly 32 built-ins; Daedalus core has 12 |
| Code intelligence | Very high | Low/planned | OMP has LSP plus DAP; Daedalus roadmap has LSP planned |
| Runtime analysis | Very high | Low | OMP has persistent Python/JS eval with tool re-entry |
| Search/read/edit quality | Very high | Medium/high | Daedalus has hashline, AST, semantic search; OMP read/search/edit is more unified and benchmarked |
| Native performance | Very high | Low | OMP ships Rust/N-API native layer; Daedalus shells out more |
| Product packaging | High | Low/medium | OMP has install scripts, npm package, release binaries; Daedalus is mostly source install |
| GUI/platform | Medium | High | Daedalus' local app-server, desktop, thread GUI are real differentiators |
| Docs | Very high | Medium/high | Daedalus has architecture docs; OMP has per-tool operational docs |
| CI/release hygiene | High | Currently suspect | Daedalus CI references missing scripts/packages |
| Strategic clarity | High | Medium | OMP says "IDE wired in"; Daedalus needs a sharper end-user promise |

## What Oh My Pi Does Better

Oh My Pi's README is a product manifesto, not just repo orientation. It claims "40+ providers", "32 built-in tools", "13 lsp ops", "27 dap ops", and about 27k lines of Rust core, then backs that with named features and captures.

The tool registry is the biggest practical gap. OMP core includes:

- `read`
- `bash`
- `edit`
- `ast_grep`
- `ast_edit`
- `render_mermaid`
- `ask`
- `debug`
- `eval`
- `calc`
- `ssh`
- `github`
- `find`
- `search`
- `lsp`
- `inspect_image`
- `browser`
- `checkpoint`
- `rewind`
- `task`
- `job`
- `recipe`
- `irc`
- `todo_write`
- `web_search`
- `search_tool_bm25`
- `write`
- Hindsight memory tools: `retain`, `recall`, `reflect`

Daedalus' default core tool list is much smaller:

- `read`
- `bash`
- `edit`
- `hashline_edit`
- `fetch`
- `web_search`
- `ast_grep`
- `ast_edit`
- `write`
- `grep`
- `find`
- `ls`

OMP also has a stronger "one interface" philosophy: `read` handles files, directories, archives, SQLite, PDFs, notebooks, URLs, and internal schemes; `write` and `search` participate in the same resource model. That reduces tool sprawl while increasing capability. Daedalus has already recognized this in its own roadmap under virtual resource schemes, but it is not yet product reality.

## What Daedalus Already Has Going For It

Daedalus has a clearer GUI/platform thesis than OMP. The top-level README describes terminal, desktop, and local browser usage, with a thread-first GUI backed by a local app-server. The package split around `app-server`, `app-server-protocol`, `gui`, `desktop`, `gui-core`, and `gui-components` is a real asset.

Daedalus' default extension bundle is also coherent:

- safety gates
- todo
- questionnaire
- filesystem search
- skills
- status dashboard
- Q&A
- handoff
- workspaces
- plan execution
- plan mode
- primary roles
- subagents
- status line
- dynamic resources
- Telegram remote

That is a good basis for a "guided work cockpit" identity instead of cloning OMP feature-for-feature.

The managed worktree and GUI/app-server lifecycle work is stronger than a typical CLI fork. Daedalus explicitly shares worktree lifecycle across CLI, TUI, SDK, and GUI surfaces. That can become a major differentiator if it is tied to real workflows: issue branches, review panels, implementation sandboxes, and resumable threads.

## Immediate Red Flags

Daedalus CI looks stale or copied from a native/Rust topology it does not have. The workflow calls `bun run check:ts`, but Daedalus root `package.json` has `check`, not `check:ts`. It also tries to build `packages/natives`, but Daedalus has no `packages/natives` or `crates` directory.

Fixing this should be priority zero. It is the kind of mismatch that makes the project look less mature than the codebase actually is.

Daedalus also has a product-install gap. Oh My Pi ships curl install, PowerShell install, npm global install, release binaries, native artifact CI, install-method smoke tests, and a real package version. Daedalus currently says clone, `bun install`, `bun link`. That alone makes OMP feel much more mature.

## Best Roadmap To Approach OMP

1. Fix reliability foundations first: CI, release script, install smoke, binary smoke, published package metadata, and a `daedalus doctor` command. The existing Daedalus roadmap already puts doctor first, and that priority is correct.

2. Make Daedalus' core tool surface competitive: add LSP, `eval`, `browser`, and `task` as first-class core concepts, not only extension/workflow concepts. Start with LSP and eval because they change coding quality immediately.

3. Build the unified resource layer: `agent://`, `skill://`, `goal://`, `pr://`, `issue://`, and `conflict://`. This is one of OMP's best ideas and fits Daedalus' GUI/thread architecture extremely well.

4. Turn the GUI into the differentiator: thread workspace, approvals, terminals, diffs, subagent outputs, worktrees, and semantic search should be first-class visual objects. Do not make Daedalus "OMP but with fewer tools"; make it "OMP-grade runtime plus a better persistent workbench."

5. Add benchmark culture: hashline success rate, edit retry rate, read token compression, search latency, task success, GUI smoke health. OMP's credibility comes partly from proving its harness choices.

6. Productize the README and docs around outcomes. Daedalus docs are deep, but the front door should say why this is better, what it can do today, how to install in one command, and what workflows are killer.

## Opinionated Priority Order

First two weeks:

- Fix CI/release/install.
- Implement `doctor`.
- Publish a working binary/source install path.
- Make the README honest but sharper.

Next month:

- Add LSP tool support.
- Add persistent eval.
- Add virtual resource resolver.
- Add per-tool docs generated from source or kept in a structured docs index.

After that:

- Task/subagent team runtime.
- Goal evidence ledger.
- Skill curation.
- Browser tool.
- Native performance selectively where measurements justify it.

## DAP Note

DAP is the Debug Adapter Protocol. It is the debugger equivalent of LSP:

- LSP lets tools talk to language servers for definitions, references, rename, diagnostics, and code actions.
- DAP lets tools talk to debuggers for breakpoints, stepping, stack frames, variables, threads, pause/continue, expression evaluation, attach, and launch.

Examples of DAP-backed debuggers include `lldb-dap` for native debugging, `debugpy` for Python, `dlv dap` for Go, `js-debug` for JavaScript/TypeScript/Node, and `codelldb` for Rust/C/C++.

In the Oh My Pi comparison, "DAP support" means the agent can drive a real debugger instead of only running tests or adding print statements. It can attach to a failing process, pause it, inspect stack frames and variables, step through execution, and use that evidence to fix the bug.

## Bottom Line

Daedalus can reach Oh My Pi's level, but the path is not "add every feature." The path is: make the runtime trustworthy, adopt OMP's best primitives, and lean hard into Daedalus' GUI/workspace advantage.
