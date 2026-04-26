import { readFileSync } from "node:fs";
import { startAppServer } from "./app-server";

interface Args {
	db: string;
	host: string;
	port: number;
	tokenFile?: string;
	token?: string;
	gui: boolean;
	project: string;
}

function parseArgs(argv: readonly string[]): Args {
	const args: Args = { db: ".daedalus/app-server.sqlite", host: "127.0.0.1", port: 0, gui: false, project: process.cwd() };
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--db" && next) {
			args.db = next;
			i += 1;
		} else if (arg === "--host" && next) {
			args.host = next;
			i += 1;
		} else if (arg === "--port" && next) {
			args.port = Number(next);
			i += 1;
		} else if (arg === "--token-file" && next) {
			args.tokenFile = next;
			i += 1;
		} else if (arg === "--token" && next) {
			args.token = next;
			i += 1;
		} else if (arg === "--gui") {
			args.gui = true;
		} else if (arg === "--project" && next) {
			args.project = next;
			i += 1;
		}
	}

	return args;
}

export async function main(argv = Bun.argv.slice(2)): Promise<void> {
	const args = parseArgs(argv);
	const token = args.token ?? (args.tokenFile ? readFileSync(args.tokenFile, "utf8").trim() : undefined);
	const server = await startAppServer({
		databasePath: args.db,
		host: args.host,
		port: args.port,
		token,
		serveGui: args.gui,
		projectRoot: args.project,
	});
	console.log(
		JSON.stringify({ httpUrl: server.httpUrl, wsUrl: server.wsUrl, token: token ? "<redacted>" : server.token }),
	);
}

if (import.meta.main) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
