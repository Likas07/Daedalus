import { createBashTool, createEditTool, createReadTool, createWriteTool } from "@daedalus-pi/coding-agent";
import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import {
	createRemoteBashOps,
	createRemoteEditOps,
	createRemoteReadOps,
	createRemoteWriteOps,
	parseSshArg,
	sshExec,
	type SshConfig,
} from "../shared/ssh.js";

export default function (pi: ExtensionAPI) {
	pi.registerFlag("ssh", { description: "SSH remote: user@host or user@host:/path", type: "string" });

	const localCwd = process.cwd();
	const localRead = createReadTool(localCwd);
	const localWrite = createWriteTool(localCwd);
	const localEdit = createEditTool(localCwd);
	const localBash = createBashTool(localCwd);

	let resolvedSsh: SshConfig | null = null;

	const getSsh = () => resolvedSsh;

	pi.registerTool({
		...localRead,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = getSsh();
			if (ssh) {
				const tool = createReadTool(localCwd, {
					operations: createRemoteReadOps(ssh.remote, ssh.remoteCwd, localCwd),
				});
				return tool.execute(id, params, signal, onUpdate);
			}
			return localRead.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localWrite,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = getSsh();
			if (ssh) {
				const tool = createWriteTool(localCwd, {
					operations: createRemoteWriteOps(ssh.remote, ssh.remoteCwd, localCwd),
				});
				return tool.execute(id, params, signal, onUpdate);
			}
			return localWrite.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localEdit,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = getSsh();
			if (ssh) {
				const tool = createEditTool(localCwd, {
					operations: createRemoteEditOps(ssh.remote, ssh.remoteCwd, localCwd),
				});
				return tool.execute(id, params, signal, onUpdate);
			}
			return localEdit.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localBash,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = getSsh();
			if (ssh) {
				const tool = createBashTool(localCwd, {
					operations: createRemoteBashOps(ssh.remote, ssh.remoteCwd, localCwd),
				});
				return tool.execute(id, params, signal, onUpdate);
			}
			return localBash.execute(id, params, signal, onUpdate);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		const arg = pi.getFlag("ssh") as string | undefined;
		if (arg) {
			const parsed = parseSshArg(arg);
			if (parsed.path) {
				resolvedSsh = { remote: parsed.remote, remoteCwd: parsed.path };
			} else {
				const pwd = (await sshExec(parsed.remote, "pwd")).toString().trim();
				resolvedSsh = { remote: parsed.remote, remoteCwd: pwd };
			}
			ctx.ui.setStatus("ssh", ctx.ui.theme.fg("accent", `SSH: ${resolvedSsh.remote}:${resolvedSsh.remoteCwd}`));
			ctx.ui.notify(`SSH mode: ${resolvedSsh.remote}:${resolvedSsh.remoteCwd}`, "info");
		}
	});

	pi.on("user_bash", (_event) => {
		const ssh = getSsh();
		if (!ssh) return;
		return { operations: createRemoteBashOps(ssh.remote, ssh.remoteCwd, localCwd) };
	});

	pi.on("before_agent_start", async (event) => {
		const ssh = getSsh();
		if (ssh) {
			const modified = event.systemPrompt.replace(
				`Current working directory: ${localCwd}`,
				`Current working directory: ${ssh.remoteCwd} (via SSH: ${ssh.remote})`,
			);
			return { systemPrompt: modified };
		}
	});
}
