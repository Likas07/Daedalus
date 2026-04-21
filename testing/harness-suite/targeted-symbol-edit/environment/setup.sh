#!/usr/bin/env bash
set -euo pipefail

mkdir -p /app/project

cat > /app/project/lookup.py <<'EOF'
USERS = {
    "ada@example.com": "ada",
    "grace@example.com": "grace",
}


def resolve_user(email: str) -> str | None:
    return USERS.get(email)
EOF

cat > /app/project/audit_lookup.py <<'EOF'
def resolve_user_for_audit(email: str) -> str:
    return f"AUDIT::{email}"
EOF

cat > /app/check.py <<'EOF'
from project.lookup import resolve_user
from project.audit_lookup import resolve_user_for_audit

print(resolve_user("ada@example.com"))
print(resolve_user_for_audit(" Ada@Example.com "))
EOF
