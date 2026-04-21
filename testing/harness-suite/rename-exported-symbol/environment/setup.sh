#!/usr/bin/env bash
set -euo pipefail

mkdir -p /app/project /app/docs

cat > /app/project/__init__.py <<'EOF'
from .plan import build_plan, build_plan_summary
from .service import render_everything

__all__ = ["build_plan", "build_plan_summary", "render_everything"]
EOF

cat > /app/project/plan.py <<'EOF'
def build_plan(items: list[str]) -> str:
    return " | ".join(item.upper() for item in items)


def build_plan_summary(items: list[str]) -> str:
    return f"{len(items)} items"
EOF

cat > /app/project/service.py <<'EOF'
from .plan import build_plan, build_plan_summary


def render_everything(items: list[str]) -> tuple[str, str]:
    return build_plan(items), build_plan_summary(items)
EOF

cat > /app/demo.py <<'EOF'
from project import build_plan, render_everything

print(build_plan(["daedalus", "harbor"]))
print(render_everything(["daedalus", "harbor"])[1])
EOF

cat > /app/docs/notes.md <<'EOF'
The old build_plan name is intentionally mentioned here for documentation history.
EOF
