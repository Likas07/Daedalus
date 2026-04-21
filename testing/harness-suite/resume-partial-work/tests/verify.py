import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path("/app")
README = ROOT / "README.md"
SETTINGS = ROOT / "app/settings.py"
README_HASH = hashlib.sha256(README.read_bytes()).hexdigest()
SETTINGS_HASH = hashlib.sha256(SETTINGS.read_bytes()).hexdigest()

plain = subprocess.run(["python", "/app/app.py"], check=True, capture_output=True, text=True)
assert plain.stdout == "Daedalus [ready] checks=3\n", plain.stdout

json_output = subprocess.run(["python", "/app/app.py", "--json"], check=True, capture_output=True, text=True)
payload = json.loads(json_output.stdout)
assert payload == {"project": "Daedalus", "status": "ready", "checks": 3}, payload

assert hashlib.sha256(README.read_bytes()).hexdigest() == README_HASH, "README.md must remain unchanged"
assert hashlib.sha256(SETTINGS.read_bytes()).hexdigest() == SETTINGS_HASH, "app/settings.py must remain unchanged"
