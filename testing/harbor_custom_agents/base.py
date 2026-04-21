from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from harbor.agents.installed.base import BaseInstalledAgent
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext


def copy_repo(repo_path: Path, ignore: tuple[str, ...]) -> Path:
    repo_path = repo_path.resolve()
    if not repo_path.exists():
        raise FileNotFoundError(f"Repository path does not exist: {repo_path}")

    temp_root = Path(tempfile.mkdtemp(prefix=f"harbor-agent-{repo_path.name}-"))
    target = temp_root / repo_path.name
    shutil.copytree(repo_path, target, ignore=shutil.ignore_patterns(*ignore))
    return target


def git_version(repo_path: Path) -> str | None:
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_path), "rev-parse", "--short", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        )
    except Exception:
        return None
    return result.stdout.strip() or None


class LocalRepoAgent(BaseInstalledAgent):
    repo_path: Path
    repo_dir_name: str
    output_filename: str
    staging_ignore: tuple[str, ...] = (".git",)

    def __init__(self, *args, repo_path: str, **kwargs):
        self.repo_path = Path(repo_path).resolve()
        self.repo_dir_name = self.repo_path.name
        super().__init__(*args, version=git_version(self.repo_path), **kwargs)

    async def stage_repo(self, environment: BaseEnvironment) -> str:
        staged = copy_repo(self.repo_path, self.staging_ignore)
        target_dir = f"/opt/{self.repo_dir_name}"
        try:
            await environment.upload_dir(staged, target_dir)
        finally:
            shutil.rmtree(staged.parent, ignore_errors=True)
        return target_dir

    async def run_logged(
        self,
        environment: BaseEnvironment,
        command: str,
        *,
        env: dict[str, str] | None = None,
        cwd: str | None = None,
    ) -> None:
        await self.exec_as_agent(
            environment,
            command=f"{command} 2>&1 | tee /logs/agent/{self.output_filename}",
            env=env,
            cwd=cwd,
        )

    def populate_context_post_run(self, context: AgentContext) -> None:
        output_path = self.logs_dir / self.output_filename
        if output_path.exists():
            metadata = dict(context.metadata or {})
            metadata["output_log"] = output_path.read_text(errors="replace")
            context.metadata = metadata
