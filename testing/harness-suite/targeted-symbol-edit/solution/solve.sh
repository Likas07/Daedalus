#!/usr/bin/env bash
set -euo pipefail

cat > /app/project/lookup.py <<'EOF'
USERS = {
    "ada@example.com": "ada",
    "grace@example.com": "grace",
}


def resolve_user(email: str) -> str | None:
    return USERS.get(email.strip().lower())
EOF