#!/bin/sh
set -eu

python - <<'PY'
from pathlib import Path

root = Path('/app/repo')
replacements = {
    root / 'config/.env': {
        'AKIAIOSFODNN7EXAMPLE': '<your-aws-access-key-id>',
        'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY': '<your-aws-secret-access-key>',
    },
    root / 'deploy/settings.yml': {
        'ghp_exampleSecretToken1234567890': '<your-github-token>',
    },
}

for path, mapping in replacements.items():
    text = path.read_text()
    for old, new in mapping.items():
        text = text.replace(old, new)
    path.write_text(text)
PY

git -C /app/repo add config/.env deploy/settings.yml
git -C /app/repo commit -m 'Sanitize repository secrets' >/dev/null
