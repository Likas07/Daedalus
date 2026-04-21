Update only `resolve_user` in `/app/project/lookup.py`.

Requirements:
- `resolve_user` must trim surrounding whitespace and perform case-insensitive email lookup.
- Do not change `/app/project/audit_lookup.py`.
- Do not change the behavior of `resolve_user_for_audit`.

When you are done, regular lookups should accept inputs like `" Ada@Example.com "`, but the audit helper must still echo the original string unchanged.