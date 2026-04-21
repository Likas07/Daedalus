import ast
import subprocess
from pathlib import Path

ROOT = Path("/app")
DOCS = ROOT / "docs/notes.md"
EXPECTED_DOCS = "The old build_plan name is intentionally mentioned here for documentation history.\n"

result = subprocess.run(["python", "/app/demo.py"], check=True, capture_output=True, text=True)
assert result.stdout == "DAEDALUS | HARBOR\n2 items\n", result.stdout

import sys
sys.path.insert(0, str(ROOT))

from project import __all__ as package_exports  # noqa: E402

assert "render_plan" in package_exports, package_exports
assert "build_plan" not in package_exports, package_exports

for path in (ROOT / "project").glob("*.py"):
    tree = ast.parse(path.read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            assert node.name != "build_plan", f"old function name remains in {path.name}"
        if isinstance(node, ast.Name):
            assert node.id != "build_plan", f"old identifier remains in {path.name}"
        if isinstance(node, ast.alias):
            assert node.name != "build_plan", f"old import remains in {path.name}"

assert DOCS.read_text() == EXPECTED_DOCS, "docs file must remain unchanged"
