import { spawn } from "node:child_process";
import type {
	BashOperations,
	EditOperations,
	ReadOperations,
	WriteOperations,
} from "@daedalus-pi/coding-agent";

export interface SshConfig {
	remote: string;
	remoteCwd: string;
}

export function parseSshArg(arg: string): { remote: string; path?: string } {
	const separatorIndex = arg.indexOf(":");
	if (separatorIndex !== -1) {
		const remote = arg.slice(0, separatorIndex);
		const path = arg.slice(separatorIndex + 1);
		return { remote, path };
	}

	return { remote: arg };
}

export function sshExec(remote: string, command: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const child = spawn("ssh", [remote, command], { stdio: ["ignore", "pipe", "pipe"] });
		const chunks: Buffer[] = [];
		const errChunks: Buffer[] = [];

		child.stdout.on("data", (data) => chunks.push(data));
		child.stderr.on("data", (data) => errChunks.push(data));
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`SSH failed (${code}): ${Buffer.concat(errChunks).toString()}`));
			} else {
				resolve(Buffer.concat(chunks));
			}
		});
	});
}

function toRemotePath(localCwd: string, remoteCwd: string, p: string): string {
	return p.replace(localCwd, remoteCwd);
}

export function createRemoteReadOps(remote: string, remoteCwd: string, localCwd: string): ReadOperations {
	const remap = (p: string) => toRemotePath(localCwd, remoteCwd, p);
	return {
		readFile: (p) => sshExec(remote, `cat ${JSON.stringify(remap(p))}`),
		access: (p) => sshExec(remote, `test -r ${JSON.stringify(remap(p))}`).then(() => {}),
		detectImageMimeType: async (p) => {
			try {
				const result = await sshExec(remote, `file --mime-type -b ${JSON.stringify(remap(p))}`);
				const mimeType = result.toString().trim();
				return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mimeType) ? mimeType : null;
			} catch {
				return null;
			}
		},
	};
}

export function createRemoteWriteOps(remote: string, remoteCwd: string, localCwd: string): WriteOperations {
	const remap = (p: string) => toRemotePath(localCwd, remoteCwd, p);
	return {
		writeFile: async (p, content) => {
			const base64Content = Buffer.from(content).toString("base64");
			await sshExec(remote, `echo ${JSON.stringify(base64Content)} | base64 -d > ${JSON.stringify(remap(p))}`);
		},
		mkdir: (dir) => sshExec(remote, `mkdir -p ${JSON.stringify(remap(dir))}`).then(() => {}),
	};
}

export function createRemoteEditOps(remote: string, remoteCwd: string, localCwd: string): EditOperations {
	const readOps = createRemoteReadOps(remote, remoteCwd, localCwd);
	const writeOps = createRemoteWriteOps(remote, remoteCwd, localCwd);
	return { readFile: readOps.readFile, access: readOps.access, writeFile: writeOps.writeFile };
}

export function createRemoteBashOps(remote: string, remoteCwd: string, localCwd: string): BashOperations {
	const remap = (p: string) => toRemotePath(localCwd, remoteCwd, p);
	return {
		exec: (command, cwd, { onData, signal, timeout }) =>
			new Promise((resolve, reject) => {
				const remoteCommand = `cd ${JSON.stringify(remap(cwd))} && ${command}`;
				const child = spawn("ssh", [remote, remoteCommand], { stdio: ["ignore", "pipe", "pipe"] });
				let timedOut = false;
				const timer = timeout
					? setTimeout(() => {
							timedOut = true;
							child.kill();
						}, timeout * 1000)
					: undefined;

				child.stdout.on("data", onData);
				child.stderr.on("data", onData);
				child.on("error", (error) => {
					if (timer) clearTimeout(timer);
					reject(error);
				});

				const onAbort = () => child.kill();
				signal?.addEventListener("abort", onAbort, { once: true });
				child.on("close", (code) => {
					if (timer) clearTimeout(timer);
					signal?.removeEventListener("abort", onAbort);
					if (signal?.aborted) reject(new Error("aborted"));
					else if (timedOut) reject(new Error(`timeout:${timeout}`));
					else resolve({ exitCode: code });
				});
			}),
	};
}
