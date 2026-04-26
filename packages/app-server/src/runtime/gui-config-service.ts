import type { AppServerDatabase } from "../persistence/database";

export class GuiConfigService {
	constructor(private readonly database: AppServerDatabase) {
		this.database.exec(`
CREATE TABLE IF NOT EXISTS gui_config (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`);
	}

	get(key?: string): Record<string, unknown> {
		if (key) {
			const row = this.database.query<{ value: string }, [string]>("SELECT value FROM gui_config WHERE key = ?").get(key);
			return row ? { [key]: safeParse(row.value) } : {};
		}
		const rows = this.database.query<{ key: string; value: string }, []>("SELECT key, value FROM gui_config").all();
		return Object.fromEntries(rows.map((row) => [row.key, safeParse(row.value)]));
	}

	getValue<T>(key: string, fallback: T): T {
		const value = this.get(key)[key];
		return value === undefined ? fallback : (value as T);
	}

	set(key: string, value: unknown): Record<string, unknown> {
		this.database
			.query(
				"INSERT INTO gui_config (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
			)
			.run(key, JSON.stringify(value));
		return this.get(key);
	}
}

function safeParse(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}
