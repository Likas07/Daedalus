import * as fs from "node:fs";
import type { ExtensionAPI } from "@daedalus-pi/coding-agent";

const DEFAULT_TRIGGER_FILE = "/tmp/daedalus-trigger.txt";

export default function (pi: ExtensionAPI) {
	let watcher: fs.FSWatcher | undefined;

	function startWatcher(triggerFile: string) {
		if (watcher) {
			watcher.close();
			watcher = undefined;
		}

		try {
			watcher = fs.watch(triggerFile, () => {
				try {
					const content = fs.readFileSync(triggerFile, "utf-8").trim();
					if (content) {
						pi.sendMessage(
							{
								customType: "file-trigger",
								content: `External trigger: ${content}`,
								display: true,
							},
							{ triggerTurn: true },
						);
						fs.writeFileSync(triggerFile, "");
					}
				} catch {
					// File might not exist yet
				}
			});
		} catch {
			// Trigger file doesn't exist yet - that's fine
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		const triggerFile = process.env.DAEDALUS_TRIGGER_FILE || DEFAULT_TRIGGER_FILE;
		startWatcher(triggerFile);
		if (ctx.hasUI) {
			ctx.ui.notify(`Watching ${triggerFile}`, "info");
		}
	});

	pi.on("session_shutdown", async () => {
		if (watcher) {
			watcher.close();
			watcher = undefined;
		}
	});
}
