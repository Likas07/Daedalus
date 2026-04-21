from __future__ import annotations

import argparse
import os
import shlex
import shutil
import subprocess
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
DAEDALUS_ROOT = SCRIPT_DIR.parent
WORKSPACE_ROOT = DAEDALUS_ROOT.parent
DEFAULT_DATASET = SCRIPT_DIR / "harness-suite"
DEFAULT_RESULTS = SCRIPT_DIR / "results"
DEFAULT_MATRIX = SCRIPT_DIR / "benchmark_matrix.toml"
DEFAULT_MODEL = "openai/gpt-5.4"


@dataclass
class AuthBinding:
    env: str
    kind: str
    label: str
    container_target: str
    required: bool
    login_hint: str
    default: str | None = None
    default_strategy: str | None = None
    json_file: str | None = None
    json_keys_any: list[str] | None = None


@dataclass
class HarnessSpec:
    name: str
    mode: str
    model: str
    auth: list[AuthBinding]
    agent: str | None = None
    agent_import_path: str | None = None
    repo_path: str | None = None
    agent_kwargs: dict[str, str] | None = None
    agent_setup_timeout_multiplier: float | None = None

@dataclass
class ResolvedAuth:
    binding: AuthBinding
    host_path: Path | None
    status: str


def expand_path(raw: str) -> Path:
    return Path(os.path.expandvars(raw)).expanduser().resolve()


def resolve_default_path(binding: AuthBinding) -> Path | None:
    if binding.default_strategy == "forge_config_dir":
        legacy = Path.home() / "forge"
        if legacy.is_dir():
            return legacy.resolve()
        return (Path.home() / ".forge").resolve()
    if binding.default_strategy == "free_code_auth_file":
        config_dir = os.environ.get("CLAUDE_CONFIG_DIR")
        if config_dir:
            return (Path(config_dir).expanduser() / ".claude.json").resolve()
        return (Path.home() / ".claude.json").resolve()
    if binding.default:
        return expand_path(binding.default)
    return None


def has_required_json_keys(candidate: Path, binding: AuthBinding) -> bool:
    if not binding.json_keys_any:
        return True
    json_path = candidate / binding.json_file if binding.kind == "dir" and binding.json_file else candidate
    try:
        payload = tomllib.loads(json_path.read_text()) if json_path.suffix == ".toml" else __import__("json").loads(json_path.read_text())
    except Exception:
        return False
    if not isinstance(payload, dict):
        return False
    return any(key in payload for key in binding.json_keys_any)


def resolve_auth(binding: AuthBinding) -> ResolvedAuth:
    explicit = os.environ.get(binding.env)
    candidate = expand_path(explicit) if explicit else resolve_default_path(binding)
    if candidate is None:
        return ResolvedAuth(binding=binding, host_path=None, status="missing")

    exists = candidate.is_dir() if binding.kind == "dir" else candidate.is_file()
    if exists and has_required_json_keys(candidate, binding):
        return ResolvedAuth(binding=binding, host_path=candidate, status="found")
    if binding.required:
        return ResolvedAuth(binding=binding, host_path=candidate, status="missing")
    return ResolvedAuth(binding=binding, host_path=candidate, status="optional-missing")


def load_matrix(path: Path) -> list[HarnessSpec]:
    data = tomllib.loads(path.read_text())
    specs: list[HarnessSpec] = []
    for raw in data.get("harness", []):
        auth = [AuthBinding(**item) for item in raw.get("auth", [])]
        specs.append(
            HarnessSpec(
                name=raw["name"],
                mode=raw["mode"],
                model=raw.get("model", DEFAULT_MODEL),
                auth=auth,
                agent=raw.get("agent"),
                agent_import_path=raw.get("agent_import_path"),
                repo_path=raw.get("repo_path"),
                agent_kwargs=raw.get("agent_kwargs"),
                agent_setup_timeout_multiplier=raw.get("agent_setup_timeout_multiplier"),
            )
        )
    return specs


def resolve_harbor_cmd(harbor_bin: str) -> list[str]:
    if harbor_bin != "harbor":
        return [harbor_bin]
    if shutil.which("harbor"):
        return ["harbor"]
    return ["uv", "run", "--directory", str(SCRIPT_DIR / "harbor"), "harbor"]


def build_env_for_harness(resolved: list[ResolvedAuth]) -> dict[str, str]:
    env = os.environ.copy()
    pythonpath_parts = [str(SCRIPT_DIR)]
    existing = env.get("PYTHONPATH")
    if existing:
        pythonpath_parts.append(existing)
    env["PYTHONPATH"] = os.pathsep.join(pythonpath_parts)
    for item in resolved:
        if item.host_path is not None and item.status == "found":
            env[item.binding.env] = str(item.host_path)
    return env


def build_command(
    harbor_cmd: list[str],
    dataset: Path,
    results_dir: Path,
    n_concurrent: int,
    run_id: str,
    harness: HarnessSpec,
    model: str,
) -> list[str]:
    job_name = f"{run_id}__{harness.name}"
    cmd = [
        *harbor_cmd,
        "run",
        "-p",
        str(dataset),
        "--jobs-dir",
        str(results_dir),
        "--job-name",
        job_name,
        "-m",
        model,
        "-n",
        str(n_concurrent),
    ]
    if harness.mode == "built_in":
        cmd.extend(["-a", harness.agent or ""])
    else:
        cmd.extend(["--agent-import-path", harness.agent_import_path or ""])
        if harness.repo_path:
            cmd.extend(["--agent-kwarg", f"repo_path={harness.repo_path}"])
    for key, value in (harness.agent_kwargs or {}).items():
        cmd.extend(["--agent-kwarg", f"{key}={value}"])
    if harness.agent_setup_timeout_multiplier is not None:
        cmd.extend(["--agent-setup-timeout-multiplier", str(harness.agent_setup_timeout_multiplier)])
    return cmd


def print_dry_run(harness: HarnessSpec, auth: list[ResolvedAuth], cmd: list[str]) -> None:
    print(f"\n=== {harness.name} ===")
    print("auth bindings:")
    for item in auth:
        source = str(item.host_path) if item.host_path else "<none>"
        print(
            f"  - {item.binding.label}: status={item.status} env={item.binding.env} source={source} target={item.binding.container_target}"
        )
    print("command:")
    print("  " + shlex.join(cmd))


def collect_auth_errors(harness: HarnessSpec, resolved: list[ResolvedAuth]) -> list[str]:
    missing = [item for item in resolved if item.binding.required and item.status != "found"]
    details: list[str] = []
    for item in missing:
        expected = item.host_path if item.host_path is not None else "<unresolved>"
        details.append(
            f"Missing {item.binding.label}: {expected}\nRun: {item.binding.login_hint}\nSet override: {item.binding.env}"
        )
    return details


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Harbor harness benchmarks")
    parser.add_argument("harnesses", nargs="*", help="Harness names to run")
    parser.add_argument("--all", action="store_true", help="Run all harnesses in the matrix")
    parser.add_argument("--dry-run", action="store_true", help="Print resolved auth sources and Harbor commands without running them")
    parser.add_argument("--matrix", default=str(DEFAULT_MATRIX), help="Path to benchmark_matrix.toml")
    parser.add_argument("--dataset", default=str(DEFAULT_DATASET), help="Path to Harbor dataset directory")
    parser.add_argument("--results-dir", default=str(DEFAULT_RESULTS), help="Directory for Harbor job outputs")
    parser.add_argument("--model", default=os.environ.get("MODEL"), help="Optional model override")
    parser.add_argument("--n-concurrent", type=int, default=int(os.environ.get("N_CONCURRENT", "1")), help="Harbor trial concurrency")
    parser.add_argument("--run-id", default=os.environ.get("RUN_ID") or subprocess.check_output(["date", "+%Y%m%d-%H%M%S"], text=True).strip(), help="Run group identifier")
    parser.add_argument("--harbor-bin", default=os.environ.get("HARBOR_BIN", "harbor"), help="Harbor executable or command name")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    matrix = load_matrix(Path(args.matrix))
    by_name = {item.name: item for item in matrix}
    selected_names = list(by_name) if args.all or not args.harnesses else args.harnesses
    unknown = [name for name in selected_names if name not in by_name]
    if unknown:
        raise SystemExit(f"Unknown harnesses: {', '.join(unknown)}")

    dataset = Path(args.dataset).resolve()
    results_dir = Path(args.results_dir).resolve()
    results_dir.mkdir(parents=True, exist_ok=True)
    harbor_cmd = resolve_harbor_cmd(args.harbor_bin)

    prepared: list[tuple[HarnessSpec, list[ResolvedAuth], list[str], list[str]]] = []
    preflight_failures: list[str] = []
    for name in selected_names:
        harness = by_name[name]
        resolved_auth = [resolve_auth(binding) for binding in harness.auth]
        model = args.model or harness.model
        cmd = build_command(harbor_cmd, dataset, results_dir, args.n_concurrent, args.run_id, harness, model)
        errors = collect_auth_errors(harness, resolved_auth)
        prepared.append((harness, resolved_auth, cmd, errors))
        if args.dry_run:
            print_dry_run(harness, resolved_auth, cmd)
    for harness, _, _, errors in prepared:
        if errors:
            preflight_failures.append(f"Auth preflight failed for {harness.name}:\n\n" + "\n\n".join(errors))
    if preflight_failures:
        raise SystemExit("\n\n".join(preflight_failures))
    if args.dry_run:
        return 0
    for harness, resolved_auth, cmd, _ in prepared:
        env = build_env_for_harness(resolved_auth)
        print(f"\n=== Running {harness.name} ===")
        print(f"job_name={args.run_id}__{harness.name}")
        subprocess.run(cmd, check=True, env=env)

    print()
    print(f"Completed run group {args.run_id} for harnesses: {' '.join(selected_names)}")
    print(f"Results directory: {results_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
