# GUI SQLite persistence

The GUI uses SQLite as its primary session store. JSONL remains the compatibility format for import, export, and terminal/TUI session interoperability.

## Database location

For `daedalus gui`, the database is created under the selected project:

```text
<project>/.daedalus/app-server.sqlite
```

The desktop app records the active database path in its app-server manifest (`app-server.json`) in the Daedalus state directory. Diagnostics and support bundles include the database path, not raw bearer tokens.

## Stored data

SQLite stores GUI sessions, ordered session entries, read models, approvals, attachments, exports, project metadata, app events, and replay cursors. Session entries preserve the original entry JSON so the store can export JSONL without lossy conversion.

## JSONL import and export

Use the GUI session actions or protocol methods to import and export JSONL:

- import: existing TUI/CLI JSONL sessions become SQLite GUI sessions.
- export: a GUI SQLite session is serialized as JSONL for CLI/TUI compatibility, archival, or support handoff.

Compatibility boundary: the GUI database is authoritative for GUI sessions after import. TUI/CLI tools should consume an exported JSONL copy rather than writing directly into the SQLite database.

## Migrations and recovery

The app-server applies migrations when it opens the database. If migration fails:

1. stop all Daedalus GUI processes;
2. copy `<project>/.daedalus/app-server.sqlite` and any `*.sqlite-wal`/`*.sqlite-shm` files;
3. restart with `daedalus gui --project <project> --no-open` to verify startup;
4. export a diagnostics/support bundle for investigation.

For severe corruption, keep the copied database, remove only the active database files, restart the GUI, then re-import any available JSONL exports.

## Backups

Back up the SQLite file together with its WAL/SHM sidecars while the app-server is stopped. For portable backups, prefer JSONL export per session.
