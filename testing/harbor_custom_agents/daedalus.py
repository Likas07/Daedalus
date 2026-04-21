from __future__ import annotations

import shlex
from pathlib import Path

from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

from .auth import resolve_existing_path, upload_auth_file
from .base import LocalRepoAgent

def resolve_subscription_model(model_name: str | None) -> str:
    model = model_name or "openai-codex/gpt-5.4"
    if model.startswith("openai/"):
        return "openai-codex/" + model.split("/", 1)[1]
    return model



class DaedalusAgent(LocalRepoAgent):
    output_filename = "daedalus.txt"
    staging_ignore = (
        ".git",
        "node_modules",
        "dist",
        "coverage",
        "testing",
        ".DS_Store",
    )

    @staticmethod
    def name() -> str:
        return "daedalus-local"

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
            self._get_env("DAEDALUS_AUTH_PATH"),
            Path.home() / ".daedalus" / "agent" / "auth.json",
            label="Daedalus auth.json",
        )
        agent_dir = "/tmp/daedalus-agent"
        await upload_auth_file(environment, auth_path, f"{agent_dir}/auth.json")
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
            env={"DAEDALUS_CODING_AGENT_DIR": agent_dir},
        )
