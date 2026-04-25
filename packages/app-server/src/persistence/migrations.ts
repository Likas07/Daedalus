import type { AppServerDatabase } from "./database";

interface Migration {
	readonly version: number;
	readonly name: string;
	readonly sql: string;
}

const migrations: readonly Migration[] = [
	{
		version: 1,
		name: "initial_event_store_and_projections",
		sql: `
CREATE TABLE IF NOT EXISTS runtime_events (
	seq INTEGER PRIMARY KEY AUTOINCREMENT,
	stream_id TEXT NOT NULL,
	type TEXT NOT NULL,
	payload TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS runtime_events_stream_seq_idx ON runtime_events(stream_id, seq);
CREATE INDEX IF NOT EXISTS runtime_events_type_seq_idx ON runtime_events(type, seq);

CREATE TRIGGER IF NOT EXISTS runtime_events_no_update
BEFORE UPDATE ON runtime_events
BEGIN
	SELECT RAISE(ABORT, 'runtime_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS runtime_events_no_delete
BEFORE DELETE ON runtime_events
BEGIN
	SELECT RAISE(ABORT, 'runtime_events is append-only');
END;

CREATE TABLE IF NOT EXISTS projects (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	path TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS worktrees (
	id TEXT PRIMARY KEY,
	project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
	path TEXT NOT NULL,
	branch TEXT,
	base_branch TEXT,
	status TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
	id TEXT PRIMARY KEY,
	project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
	worktree_id TEXT REFERENCES worktrees(id) ON DELETE SET NULL,
	status TEXT NOT NULL,
	title TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS turns (
	id TEXT PRIMARY KEY,
	session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
	role TEXT NOT NULL,
	content TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
	id TEXT PRIMARY KEY,
	session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
	status TEXT NOT NULL,
	request TEXT NOT NULL,
	response TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkpoints (
	id TEXT PRIMARY KEY,
	session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
	worktree_id TEXT REFERENCES worktrees(id) ON DELETE CASCADE,
	label TEXT,
	metadata TEXT NOT NULL DEFAULT '{}',
	created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS terminal_sessions (
	id TEXT PRIMARY KEY,
	project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
	worktree_id TEXT REFERENCES worktrees(id) ON DELETE SET NULL,
	status TEXT NOT NULL,
	cwd TEXT NOT NULL,
	shell TEXT NOT NULL DEFAULT '',
	cols INTEGER NOT NULL DEFAULT 80,
	rows INTEGER NOT NULL DEFAULT 24,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integration_resources (
	id TEXT PRIMARY KEY,
	provider TEXT NOT NULL,
	resource_type TEXT NOT NULL,
	external_id TEXT NOT NULL,
	data TEXT NOT NULL DEFAULT '{}',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE(provider, resource_type, external_id)
);

CREATE TABLE IF NOT EXISTS integration_states (
	provider TEXT PRIMARY KEY,
	status TEXT NOT NULL,
	data TEXT NOT NULL DEFAULT '{}',
	updated_at TEXT NOT NULL
);
`,
	},
	{
		version: 2,
		name: "projection_state",
		sql: `
CREATE TABLE IF NOT EXISTS projection_state (
	name TEXT PRIMARY KEY,
	last_seq INTEGER NOT NULL DEFAULT 0,
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`,
	},

	{
		version: 3,
		name: "terminal_session_metadata",
		sql: `
		SELECT 1; -- Columns are included in the initial schema for fresh databases.
		`,
	},
	{
		version: 4,
		name: "integration_states",
		sql: `
CREATE TABLE IF NOT EXISTS integration_states (
	provider TEXT PRIMARY KEY,
	status TEXT NOT NULL,
	data TEXT NOT NULL DEFAULT '{}',
	updated_at TEXT NOT NULL
);
`,
	},
];

export function runMigrations(database: AppServerDatabase): void {
	database.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
	version INTEGER PRIMARY KEY,
	name TEXT NOT NULL,
	applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`);

	const appliedRows = database.query<{ version: number }, []>("SELECT version FROM schema_migrations").all();
	const applied = new Set(appliedRows.map((row) => row.version));

	const applyMigration = database.transaction((migration: Migration) => {
		database.exec(migration.sql);
		database
			.query("INSERT INTO schema_migrations (version, name) VALUES (?, ?)")
			.run(migration.version, migration.name);
	});

	for (const migration of migrations) {
		if (!applied.has(migration.version)) {
			applyMigration(migration);
		}
	}
}
