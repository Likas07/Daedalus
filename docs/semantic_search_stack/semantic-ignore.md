# Semantic Ignore

Daedalus semantic indexing always excludes dependency, build, cache, generated, snapshot, lockfile, and internal store paths.

For tracked files that are useful in git but low-value for semantic search, add a `.semanticignore` file. It uses gitignore-style patterns and can appear at the workspace root or in nested directories.

Examples:

```gitignore
benchmarks/
fixtures/**/*.json
*.fixture.json
snapshots/
```
