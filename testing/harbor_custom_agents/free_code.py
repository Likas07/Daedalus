from __future__ import annotations

import shlex
from pathlib import Path

from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

from .auth import resolve_existing_path, upload_auth_file
from .base import LocalRepoAgent


class FreeCodeAgent(LocalRepoAgent):
    output_filename = "free-code.txt"
    staging_ignore = (
        ".git",
        "node_modules",
        "dist",
        "coverage",
        ".DS_Store",
    )

    @staticmethod
    def name() -> str:
        return "free-code-local"

    async def install(self, environment: BaseEnvironment) -> None:
        repo_dir = await self.stage_repo(environment)
        await self.exec_as_root(
            environment,
            command="apt-get update && apt-get install -y curl git unzip xz-utils ca-certificates",
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
        auth_path = resolve_existing_path(
            self._get_env("FREE_CODE_AUTH_PATH"),
            Path.home() / ".claude.json",
            label="free-code global auth file",
        )
        config_dir = "/tmp/free-code-config"
        await upload_auth_file(environment, auth_path, f"{config_dir}/.claude.json")
        await self.run_logged(
            environment,
            (
                "set -euo pipefail; "
                'export BUN_INSTALL="$HOME/.bun"; '
                'export PATH="$BUN_INSTALL/bin:$PATH"; '
                f"cd {repo_dir}; "
                f"bun run dev -- -p {shlex.quote(instruction)} --model {shlex.quote((self.model_name or 'openai/gpt-5.4').split('/', 1)[-1])}"
            ),
            env={"CLAUDE_CONFIG_DIR": config_dir},
        )
