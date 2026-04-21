#!/usr/bin/env bash
set -euo pipefail

mkdir -p /app/repo/config /app/repo/deploy /app/repo/src /app/repo/docs
cd /app/repo

git init -b main
git config user.email "task@example.com"
git config user.name "Task Author"

cat > config/.env <<'EOF'
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
EOF

cat > deploy/settings.yml <<'EOF'
github_token: ghp_exampleSecretToken1234567890
region: us-west-2
EOF

cat > src/app.py <<'EOF'
MESSAGE = "hello"
EOF

cat > docs/notes.md <<'EOF'
# Deployment notes

No credentials belong in this repository.
EOF

git add .
git commit -m "Initial repository state"
