import hashlib
import subprocess
from pathlib import Path

LEGACY = Path("/app/legacy/analyze.py")
EXPECTED_LEGACY_HASH = hashlib.sha256(LEGACY.read_bytes()).hexdigest()
EXPECTED_OUTPUT = "Station 101 mean temperature: 20.0°C\nStation 102 mean temperature: 18.0°C\n"

result = subprocess.run(
    ["python", "/app/analyze_modern.py"],
    check=True,
    capture_output=True,
    text=True,
    cwd="/app",
)
assert result.stdout == EXPECTED_OUTPUT, result.stdout
assert hashlib.sha256(LEGACY.read_bytes()).hexdigest() == EXPECTED_LEGACY_HASH, "legacy script must remain unchanged"

requirements = Path("/app/requirements.txt").read_text().lower()
assert "pandas" in requirements, "requirements.txt must mention pandas"
assert "numpy" in requirements, "requirements.txt must mention numpy"
assert any(op in requirements for op in (">=", "==", "~=")), "requirements must include version constraints"
