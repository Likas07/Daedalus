# Phase 5 remove tool parity note

Remove tool parity: N/A — Daedalus does not ship a first-class remove/rm/delete file tool under `packages/coding-agent/src/core/tools`. File deletion is available only through `bash`, so read-before-remove enforcement is left to shell permission/policy handling rather than a tool-level read ledger guard.
