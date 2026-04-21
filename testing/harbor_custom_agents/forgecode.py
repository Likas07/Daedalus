from __future__ import annotations

import shlex
from pathlib import Path

from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

from .auth import resolve_existing_path, upload_auth_dir
from .base import LocalRepoAgent


class ForgeCodeAgent(LocalRepoAgent):
    output_filename = "forgecode.txt"
    staging_ignore = (
        ".git",
        "target",
        ".DS_Store",
    )

    @staticmethod
    def name() -> str:
        return "forgecode-local"

    async def install(self, environment: BaseEnvironment) -> None:
        repo_dir = await self.stage_repo(environment)
        await self.exec_as_root(
            environment,
            command="apt-get update && apt-get install -y curl git build-essential pkg-config libssl-dev ca-certificates",
            env={"DEBIAN_FRONTEND": "noninteractive"},
        )
        await self.exec_as_agent(
            environment,
            command=(
                "set -euo pipefail; "
                "curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal; "
                'export PATH="$HOME/.cargo/bin:$PATH"; '
                f"cd {repo_dir}; cargo build --release -p forge_main"
            ),
        )

    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        repo_dir = f"/opt/{self.repo_dir_name}"
        forge_config = resolve_existing_path(
            self._get_env("FORGE_CONFIG_PATH"),
            (Path.home() / "forge") if (Path.home() / "forge").exists() else (Path.home() / ".forge"),
            label="Forge config directory",
            expect_dir=True,
        )
        config_dir = "/tmp/forge-config"
        await upload_auth_dir(environment, forge_config, config_dir)
        await self.run_logged(
            environment,
            (
                "set -euo pipefail; "
                'export PATH="$HOME/.cargo/bin:$PATH"; '
                f"cd {repo_dir}; "
                f"./target/release/forge -p {shlex.quote(instruction)}"
            ),
            env={
                "FORGE_CONFIG": config_dir,
                "FORGE_SESSION__PROVIDER_ID": "openai",
                "FORGE_SESSION__MODEL_ID": (self.model_name or "openai/gpt-5.4").split("/", 1)[-1],
                "FORGE_REASONING__EFFORT": "high",
            },
        )
