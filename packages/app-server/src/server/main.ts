import { readFileSync } from "node:fs";
import packageJson from "../../package.json" with { type: "json" };
import { createAppServerCore, startAppServer } from "./app-server";
import { startStdioProtocol } from "./stdio";

interface Args {
	db: string;
	host: string;
	port: number;
	tokenFile?: string;
	token?: string;
	gui: boolean;
	project: string;
	stdio: boolean;
	version: boolean;
	agentDir?: string;
}

function parseArgs(argv: readonly string[]): Args {
	const args: Args = {
		db: ".daedalus/app-server.sqlite",
		host: "127.0.0.1",
		port: 0,
		gui: false,
		project: process.cwd(),
		stdio: false,
		version: false,
	};
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
		} else if (arg === "--stdio") {
			args.stdio = true;
		} else if (arg === "--version") {
			args.version = true;
		} else if (arg === "--agent-dir" && next) {
			args.agentDir = next;
			i += 1;
		}
	}

	return args;
}

export async function main(argv = Bun.argv.slice(2)): Promise<void> {
	const args = parseArgs(argv);
	if (args.version) {
		console.log(packageJson.version);
		return;
	}
	const token = args.token ?? (args.tokenFile ? readFileSync(args.tokenFile, "utf8").trim() : undefined);
	if (args.stdio) {
		const core = await createAppServerCore({
			databasePath: args.db,
			agentDir: args.agentDir,
			projectRoot: args.project,
		});
		await startStdioProtocol(core);
		return;
	}
	const server = await startAppServer({
		databasePath: args.db,
		host: args.host,
		port: args.port,
		token,
		serveGui: args.gui,
		projectRoot: args.project,
		agentDir: args.agentDir,
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
