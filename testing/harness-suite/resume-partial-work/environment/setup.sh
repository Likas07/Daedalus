#!/usr/bin/env bash
set -euo pipefail

mkdir -p /app/app

cat > /app/app/__init__.py <<'EOF'
EOF

cat > /app/SESSION_SUMMARY.md <<'EOF'
Completed already:
- README.md documents the `--json` flag.
- app/settings.py carries the `json_output` setting.

Still missing:
- app.py does not produce JSON yet.
- report.py still ignores the setting.

Do not edit these completed files:
- README.md
- app/settings.py
EOF

cat > /app/README.md <<'EOF'
Usage:
- `python /app/app.py` prints a text report.
- `python /app/app.py --json` prints the same report as JSON.
EOF

cat > /app/app/settings.py <<'EOF'
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    json_output: bool = False
EOF

cat > /app/app/data.py <<'EOF'
def load_report() -> dict[str, object]:
    return {
        "project": "Daedalus",
        "status": "ready",
        "checks": 3,
    }
EOF

cat > /app/app/report.py <<'EOF'
from .data import load_report
from .settings import Settings


def render_report(settings: Settings) -> str:
    report = load_report()
    return f"{report['project']} [{report['status']}] checks={report['checks']}"
EOF

cat > /app/app.py <<'EOF'
import sys

from app.report import render_report
from app.settings import Settings


def main(argv: list[str]) -> int:
    settings = Settings(json_output="--json" in argv)
    print(render_report(settings))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
EOF
