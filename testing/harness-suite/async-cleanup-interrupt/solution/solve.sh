#!/bin/sh
set -eu

cat > /app/run.py <<'EOF'
import asyncio
from collections.abc import Awaitable, Callable


async def run_tasks(tasks: list[Callable[[], Awaitable[None]]], max_concurrent: int) -> None:
    if max_concurrent < 1:
        raise ValueError('max_concurrent must be at least 1')

    queue: asyncio.Queue[Callable[[], Awaitable[None]]] = asyncio.Queue()
    for task in tasks:
        queue.put_nowait(task)

    async def worker() -> None:
        while True:
            try:
                task = queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            await task()

    async with asyncio.TaskGroup() as tg:
        for _ in range(min(max_concurrent, len(tasks))):
            tg.create_task(worker())
EOF
