from __future__ import annotations

import shlex
from pathlib import Path

from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

from .auth import resolve_existing_path, upload_sqlite_db
from .base import LocalRepoAgent


def resolve_subscription_model(model_name: str | None) -> str:
    model = model_name or "openai-codex/gpt-5.4"
    if model.startswith("openai/"):
        return "openai-codex/" + model.split("/", 1)[1]
    return model


class OhMyPiAgent(LocalRepoAgent):
    output_filename = "oh-my-pi.txt"
    staging_ignore = (
        ".git",
        "node_modules",
        "dist",
        "coverage",
        ".DS_Store",
    )

    @staticmethod
    def name() -> str:
        return "oh-my-pi-local"

    async def install(self, environment: BaseEnvironment) -> None:
        repo_dir = await self.stage_repo(environment)
        await self.exec_as_root(
            environment,
            command="apt-get update && apt-get install -y curl git unzip xz-utils ca-certificates build-essential pkg-config libssl-dev",
            env={"DEBIAN_FRONTEND": "noninteractive"},
        )
        await self.exec_as_agent(
            environment,
            command=(
                "set -euo pipefail; "
                "curl -fsSL https://bun.sh/install | bash; "
                "curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal; "
                'export BUN_INSTALL="$HOME/.bun"; '
                'export PATH="$BUN_INSTALL/bin:$HOME/.cargo/bin:$PATH"; '
                f"cd {repo_dir}; bun install && bun run build:native"
            ),
        )

    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        repo_dir = f"/opt/{self.repo_dir_name}"
        db_path = resolve_existing_path(
            self._get_env("OMP_AGENT_DB_PATH"),
            Path.home() / ".omp" / "agent" / "agent.db",
            label="Oh My Pi agent.db",
        )
        agent_dir = "/tmp/omp-agent"
        await upload_sqlite_db(environment, db_path, f"{agent_dir}/agent.db")
        model = resolve_subscription_model(self.model_name)
        await self.run_logged(
            environment,
            (
                "set -euo pipefail; "
                'export BUN_INSTALL="$HOME/.bun"; '
                'export PATH="$BUN_INSTALL/bin:$PATH"; '
                f"cd {repo_dir}; "
                f"bun run dev -- --print --no-session --model {shlex.quote(model)} --thinking high {shlex.quote(instruction)}"
            ),
            env={"PI_CODING_AGENT_DIR": agent_dir},
        )
