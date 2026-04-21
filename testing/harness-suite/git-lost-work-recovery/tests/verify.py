import subprocess
from pathlib import Path

REPO = Path("/app/site")
EXPECTED_PROFILE = """Name: Ada Lovelace
Location: Stanford
Status: Building reliable developer tools
"""
EXPECTED_PROJECTS = """- Daedalus
- Harbor task design
"""


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=REPO,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


branch = git("branch", "--show-current")
assert branch == "master", f"expected master, got {branch!r}"
assert git("status", "--short") == "", "working tree must be clean"

log = git("log", "--pretty=%s")
assert "Move to Stanford" in log, "recovered commit must be replayed onto master"

profile = (REPO / "src/profile.txt").read_text()
projects = (REPO / "src/projects.txt").read_text()
assert profile == EXPECTED_PROFILE, "profile.txt does not contain recovered content"
assert projects == EXPECTED_PROJECTS, "projects.txt missing recovered content"
