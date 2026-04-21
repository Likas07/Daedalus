#!/usr/bin/env bash
set -euo pipefail

mkdir -p /app/site/src
cd /app/site

git init -b master
git config user.email "task@example.com"
git config user.name "Task Author"

cat > README.md <<'EOF'
# Personal site
EOF

cat > src/profile.txt <<'EOF'
Name: Ada Lovelace
Location: London
Status: Exploring new opportunities
EOF

git add README.md src/profile.txt
git commit -m "Initial site"

git checkout --detach

cat > src/profile.txt <<'EOF'
Name: Ada Lovelace
Location: Stanford
Status: Building reliable developer tools
EOF

cat > src/projects.txt <<'EOF'
- Daedalus
- Harbor task design
EOF

git add src/profile.txt src/projects.txt
git commit -m "Move to Stanford"

git checkout master
