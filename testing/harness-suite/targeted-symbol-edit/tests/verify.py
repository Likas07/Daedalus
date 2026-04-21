import hashlib
import importlib.util
from pathlib import Path

ROOT = Path("/app")
AUDIT_PATH = ROOT / "project/audit_lookup.py"
AUDIT_HASH = hashlib.sha256(AUDIT_PATH.read_bytes()).hexdigest()

lookup_spec = importlib.util.spec_from_file_location("lookup", ROOT / "project/lookup.py")
lookup = importlib.util.module_from_spec(lookup_spec)
assert lookup_spec and lookup_spec.loader
lookup_spec.loader.exec_module(lookup)

audit_spec = importlib.util.spec_from_file_location("audit_lookup", AUDIT_PATH)
audit = importlib.util.module_from_spec(audit_spec)
assert audit_spec and audit_spec.loader
audit_spec.loader.exec_module(audit)

assert lookup.resolve_user(" Ada@Example.com ") == "ada"
assert lookup.resolve_user("GRACE@EXAMPLE.COM") == "grace"
assert lookup.resolve_user("missing@example.com") is None
assert audit.resolve_user_for_audit(" Ada@Example.com ") == "AUDIT:: Ada@Example.com "
assert hashlib.sha256(AUDIT_PATH.read_bytes()).hexdigest() == AUDIT_HASH, "audit_lookup.py must remain unchanged"
