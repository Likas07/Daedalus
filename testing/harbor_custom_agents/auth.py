from __future__ import annotations

import os
from pathlib import Path

from harbor.environments.base import BaseEnvironment


def resolve_existing_path(
    explicit: str | None,
    default: Path,
    *,
    label: str,
    expect_dir: bool = False,
) -> Path:
    candidate = Path(explicit).expanduser() if explicit else default.expanduser()
    if expect_dir:
        if not candidate.is_dir():
            raise FileNotFoundError(f"Missing {label}: {candidate}")
    else:
        if not candidate.is_file():
            raise FileNotFoundError(f"Missing {label}: {candidate}")
    return candidate.resolve()


async def ensure_parent_dir(environment: BaseEnvironment, target_path: str) -> None:
    parent = os.path.dirname(target_path.rstrip("/"))
    if parent:
        await environment.exec(command=f"mkdir -p {parent}", user="root")


async def chown_to_default_user(environment: BaseEnvironment, target_path: str, *, recursive: bool = False) -> None:
    if environment.default_user is None:
        return
    flag = "-R " if recursive else ""
    await environment.exec(
        command=f"chown {flag}{environment.default_user}:{environment.default_user} {target_path}",
        user="root",
    )


async def upload_auth_file(environment: BaseEnvironment, source: Path, target_path: str) -> None:
    await ensure_parent_dir(environment, target_path)
    await environment.upload_file(source, target_path)
    await chown_to_default_user(environment, target_path)


async def upload_sqlite_db(environment: BaseEnvironment, source: Path, target_path: str) -> None:
    await upload_auth_file(environment, source, target_path)


async def upload_auth_dir(environment: BaseEnvironment, source: Path, target_dir: str) -> None:
    await environment.exec(command=f"mkdir -p {target_dir}", user="root")
    await environment.upload_dir(source, target_dir)
    await chown_to_default_user(environment, target_dir, recursive=True)


def default_xdg_roots(home: Path | None = None) -> dict[str, Path]:
    base_home = (home or Path.home()).expanduser()
    return {
        "data": base_home / ".local" / "share",
        "config": base_home / ".config",
        "state": base_home / ".local" / "state",
        "cache": base_home / ".cache",
    }
