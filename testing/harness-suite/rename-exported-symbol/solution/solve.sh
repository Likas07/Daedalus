#!/usr/bin/env bash
set -euo pipefail

cat > /app/project/__init__.py <<'EOF'
from .plan import build_plan_summary, render_plan
from .service import render_everything

__all__ = ["render_plan", "build_plan_summary", "render_everything"]
EOF

cat > /app/project/plan.py <<'EOF'
def render_plan(items: list[str]) -> str:
    return " | ".join(item.upper() for item in items)


def build_plan_summary(items: list[str]) -> str:
    return f"{len(items)} items"
EOF

cat > /app/project/service.py <<'EOF'
from .plan import build_plan_summary, render_plan


def render_everything(items: list[str]) -> tuple[str, str]:
    return render_plan(items), build_plan_summary(items)
EOF

cat > /app/demo.py <<'EOF'
from project import render_everything, render_plan

print(render_plan(["daedalus", "harbor"]))
print(render_everything(["daedalus", "harbor"])[1])
EOF