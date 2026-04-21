import subprocess
from pathlib import Path

REPO = Path("/app/repo")
REAL_SECRETS = [
    "AKIAIOSFODNN7EXAMPLE",
    "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "ghp_exampleSecretToken1234567890",
]
PLACEHOLDERS = {
    "config/.env": [
        "AWS_ACCESS_KEY_ID=<your-aws-access-key-id>",
        "AWS_SECRET_ACCESS_KEY=<your-aws-secret-access-key>",
    ],
    "deploy/settings.yml": ["github_token: <your-github-token>"],
}
UNTOUCHED = {
    "src/app.py": 'MESSAGE = "hello"\n',
    "docs/notes.md": "# Deployment notes\n\nNo credentials belong in this repository.\n",
}


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=REPO,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


for secret in REAL_SECRETS:
    result = subprocess.run(
        ["git", "grep", "-n", secret],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 1, f"secret still present: {secret}"

for relative_path, expected_lines in PLACEHOLDERS.items():
    content = (REPO / relative_path).read_text()
    for line in expected_lines:
        assert line in content, f"missing placeholder {line!r} in {relative_path}"

for relative_path, expected_content in UNTOUCHED.items():
    actual = (REPO / relative_path).read_text()
    assert actual == expected_content, f"untouched file changed: {relative_path}"

assert git("status", "--short") == "", "working tree must be clean"
assert git("branch", "--show-current") == "main", "repository must stay on main"
