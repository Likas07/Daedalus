import { createInterface } from "node:readline";
import type { AppServerCore } from "./app-server";
import { ProtocolSession } from "./protocol-session";

export async function startStdioProtocol(core: AppServerCore): Promise<void> {
	const session = new ProtocolSession(core.router, (message) => {
		process.stdout.write(`${JSON.stringify(message)}\n`);
	});
	core.clients.add(session);
	const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
	try {
		for await (const line of lines) {
			if (line.length === 0) continue;
			await session.receive(line);
		}
	} finally {
		core.clients.delete(session);
		await core.close();
	}
}
