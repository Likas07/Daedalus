Implement `async run_tasks(tasks: list[Callable[[], Awaitable[None]]], max_concurrent: int) -> None` in `/app/run.py`.

Requirements:
- Start at most `max_concurrent` tasks at once.
- Raise `ValueError` if `max_concurrent < 1`.
- Return only after every task finishes successfully.
- If the outer run is cancelled, cancel the in-flight tasks, wait for their cleanup code to run, then propagate the cancellation.

Use only the Python standard library.