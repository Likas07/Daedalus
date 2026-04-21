#!/usr/bin/env bash
set -euo pipefail

cat > /app/app/report.py <<'EOF'
import json

from .data import load_report
from .settings import Settings


def render_report(settings: Settings) -> str:
    report = load_report()
    if settings.json_output:
        return json.dumps(report)
    return f"{report['project']} [{report['status']}] checks={report['checks']}"
EOF