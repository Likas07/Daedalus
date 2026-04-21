import hashlib
import subprocess
from pathlib import Path

APP = Path("/app")
EXPECTED_MAIN_HASH = hashlib.sha256((APP / "main.cpp").read_bytes()).hexdigest()
EXPECTED_OUTPUT = "user:Ada Lovelace\n"


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=APP, check=True, capture_output=True, text=True)


run(["g++", "-std=c++17", "-O0", "-g", "-o", "/app/debug", "/app/main.cpp", "/app/user.cpp"])
run(["g++", "-std=c++17", "-O2", "-DNDEBUG", "-o", "/app/release", "/app/main.cpp", "/app/user.cpp"])

debug = run(["/app/debug"])
release = run(["/app/release"])

assert debug.stdout == EXPECTED_OUTPUT, debug.stdout
assert release.stdout == EXPECTED_OUTPUT, release.stdout
assert hashlib.sha256((APP / "main.cpp").read_bytes()).hexdigest() == EXPECTED_MAIN_HASH, "main.cpp must remain unchanged"
