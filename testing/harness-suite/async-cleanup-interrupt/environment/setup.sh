#!/usr/bin/env bash
set -euo pipefail

cat > /app/run.py <<'EOF'
from collections.abc import Awaitable, Callable


async def run_tasks(tasks: list[Callable[[], Awaitable[None]]], max_concurrent: int) -> None:
    raise NotImplementedError("implement run_tasks")
EOF
