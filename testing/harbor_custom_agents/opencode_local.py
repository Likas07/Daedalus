from __future__ import annotations

import shlex
from pathlib import Path

from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

from .auth import default_xdg_roots, resolve_existing_path, upload_auth_dir
from .base import LocalRepoAgent


async def upload_if_dir(environment: BaseEnvironment, source: Path, target: str) -> None:
    if source.is_dir():
        await upload_auth_dir(environment, source, target)

class OpenCodeLocalAgent(LocalRepoAgent):
    output_filename = "opencode-local.txt"
    staging_ignore = (
        ".git",
        "node_modules",
        "dist",
        "coverage",
        ".DS_Store",
    )

    @staticmethod
    def name() -> str:
        return "opencode-local"

    async def install(self, environment: BaseEnvironment) -> None:
        repo_dir = await self.stage_repo(environment)
        await self.exec_as_root(
            environment,
            command="apt-get update && apt-get install -y curl git unzip xz-utils ca-certificates build-essential python3 pkg-config",
            env={"DEBIAN_FRONTEND": "noninteractive"},
        )
        await self.exec_as_agent(
            environment,
            command=(
                "set -euo pipefail; "
                "curl -fsSL https://bun.sh/install | bash; "
                'export BUN_INSTALL="$HOME/.bun"; '
                'export PATH="$BUN_INSTALL/bin:$PATH"; '
                f"cd {repo_dir}; bun install"
            ),
        )

    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        repo_dir = f"/opt/{self.repo_dir_name}"
        xdg = default_xdg_roots()
        data_dir = resolve_existing_path(
            self._get_env("OPENCODE_AUTH_ROOT"),
            xdg["data"] / "opencode",
            label="OpenCode data directory",
            expect_dir=True,
        )
        config_dir = Path(self._get_env("OPENCODE_CONFIG_ROOT") or (xdg["config"] / "opencode"))
        state_dir = Path(self._get_env("OPENCODE_STATE_ROOT") or (xdg["state"] / "opencode"))
        cache_dir = Path(self._get_env("OPENCODE_CACHE_ROOT") or (xdg["cache"] / "opencode"))
        xdg_root = "/tmp/opencode-xdg"
        await upload_auth_dir(environment, data_dir, f"{xdg_root}/share/opencode")
        await upload_if_dir(environment, config_dir, f"{xdg_root}/config/opencode")
        await upload_if_dir(environment, state_dir, f"{xdg_root}/state/opencode")
        await upload_if_dir(environment, cache_dir, f"{xdg_root}/cache/opencode")
        await self.run_logged(
            environment,
            (
                "set -euo pipefail; "
                'export BUN_INSTALL="$HOME/.bun"; '
                'export PATH="$BUN_INSTALL/bin:$PATH"; '
                f"cd {repo_dir}; "
                f"bun --cwd=packages/opencode run dev -- run --model {shlex.quote(self.model_name or 'openai/gpt-5.4')} --variant high --format json {shlex.quote(instruction)}"
            ),
            env={
                "XDG_DATA_HOME": f"{xdg_root}/share",
                "XDG_CONFIG_HOME": f"{xdg_root}/config",
                "XDG_STATE_HOME": f"{xdg_root}/state",
                "XDG_CACHE_HOME": f"{xdg_root}/cache",
            },
        )
