# 08. Persistent Eval Kernels With Tool Re-Entry

## Why It Matters

This is one of OhMyPi's strongest runtime ideas. It turns the harness into an analysis environment, not just a shell runner.

The important part is not "run Python." Daedalus can already run shell commands.

The important part is:

- persistent state
- structured outputs
- Python and JavaScript/Bun cells
- controlled access back into Daedalus tools
- reusable analysis across a long session

## Product Shape

Add tools:

```text
eval_start
eval_run
eval_inspect
eval_reset
eval_stop
```

Example:

```json
{
  "kernel": "python",
  "code": "import json\nrows = json.loads(await daedalus.read('agent://run-1/result.json'))\nlen(rows)"
}
```

## Tool Re-Entry

Inside the kernel, expose a narrow Daedalus API:

```python
await daedalus.read(path)
await daedalus.search(query, path=None)
await daedalus.fetch(url)
await daedalus.write_artifact(path, content)
```

Do not expose arbitrary write/edit by default. Mutating repo files from inside eval should require explicit opt-in and normal approval.

## Use Cases

- analyze large JSONL session logs
- inspect benchmark results
- parse test output
- query SQLite exports
- summarize dependency graphs
- transform structured artifacts
- generate charts or tables
- call `read` on virtual resources from inside analysis

## Runtime Constraints

- Kernels are session-scoped.
- Kernels have idle timeouts.
- Output is windowed/ref-backed.
- Filesystem writes are artifact-scoped by default.
- Tool re-entry has recursion limits.
- Long cells can be cancelled.

## Security Constraints

- The kernel is code execution; it must use Daedalus' existing permission/sandbox policy.
- Network access should be explicit.
- Tool re-entry should be auditable.
- Kernel state should not be silently loaded into model context.

## Acceptance Criteria

- Python kernel can preserve variables across calls.
- Bun/JavaScript kernel can preserve variables across calls.
- Kernel can read a Daedalus resource through a controlled API.
- Kernel output larger than a threshold becomes a payload ref.
- Kernel cancellation and idle cleanup work.
