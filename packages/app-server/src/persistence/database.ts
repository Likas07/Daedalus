import { Database } from "bun:sqlite";

export type AppServerDatabase = Database;

export function openAppServerDatabase(path: string): AppServerDatabase {
	const database = new Database(path, { create: true, strict: true });
	database.exec("PRAGMA foreign_keys = ON");
	database.exec("PRAGMA journal_mode = WAL");
	database.exec("PRAGMA synchronous = NORMAL");
	return database;
}
