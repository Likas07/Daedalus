import asyncio
import importlib.util
from pathlib import Path

MODULE_PATH = Path("/app/run.py")
spec = importlib.util.spec_from_file_location("run_module", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)
run_tasks = module.run_tasks


async def verify_success_path() -> None:
    active = 0
    max_seen = 0
    completed: list[str] = []

    def make_task(name: str, delay: float):
        async def task() -> None:
            nonlocal active, max_seen
            active += 1
            max_seen = max(max_seen, active)
            try:
                await asyncio.sleep(delay)
                completed.append(name)
            finally:
                active -= 1

        return task

    tasks = [make_task("a", 0.03), make_task("b", 0.03), make_task("c", 0.01)]
    await run_tasks(tasks, 2)
    assert set(completed) == {"a", "b", "c"}, completed
    assert max_seen <= 2, f"too many concurrent tasks: {max_seen}"


async def verify_cancellation_path() -> None:
    started: list[str] = []
    cleaned: list[str] = []

    def make_task(name: str):
        async def task() -> None:
            started.append(name)
            try:
                await asyncio.sleep(10)
            finally:
                cleaned.append(name)

        return task

    driver = asyncio.create_task(run_tasks([make_task("x"), make_task("y"), make_task("z")], 2))
    await asyncio.sleep(0.05)
    driver.cancel()
    try:
        await driver
    except asyncio.CancelledError:
        pass
    else:
        raise AssertionError("run_tasks must propagate cancellation")

    assert started, "at least one task should have started"
    assert set(cleaned) == set(started), f"cleanup mismatch: started={started}, cleaned={cleaned}"


async def verify_bad_input() -> None:
    try:
        await run_tasks([], 0)
    except ValueError:
        return
    raise AssertionError("expected ValueError when max_concurrent < 1")


async def main() -> None:
    await verify_success_path()
    await verify_cancellation_path()
    await verify_bad_input()


asyncio.run(main())
