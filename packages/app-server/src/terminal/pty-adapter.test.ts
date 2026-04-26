import { describe, expect, test } from "bun:test";
import { NodePtyAdapter } from "./pty-adapter";

describe("NodePtyAdapter", () => {
	test("adapts node-pty data, resize, write, kill, and exit APIs", () => {
		const calls: unknown[] = [];
		let dataListener!: (data: string) => void;
		let exitListener!: (event: { exitCode: number; signal?: number | string }) => void;
		const adapter = new NodePtyAdapter({
			spawn(file, args, options) {
				calls.push({ file, args, options });
				return {
					pid: 42,
					write: (data) => calls.push({ write: data }),
					resize: (cols, rows) => calls.push({ resize: [cols, rows] }),
					kill: (signal) => calls.push({ kill: signal }),
					onData(listener) {
						dataListener = listener;
						return { dispose: () => calls.push("disposeData") };
					},
					onExit(listener) {
						exitListener = listener;
						return { dispose: () => calls.push("disposeExit") };
					},
				};
			},
		});
		const proc = adapter.spawn({ cwd: "/tmp", shell: "/bin/sh", cols: 100, rows: 30, env: { TERM: "xterm" } });
		const data: string[] = [];
		const exits: unknown[] = [];
		const offData = proc.onData((chunk) => data.push(chunk));
		const offExit = proc.onExit((event) => exits.push(event));
		proc.write("ls\n");
		proc.resize(120, 40);
		proc.kill("SIGTERM");
		dataListener("hello");
		exitListener({ exitCode: 0, signal: "SIGTERM" });
		offData();
		offExit();
		expect(proc.pid).toBe(42);
		expect(data).toEqual(["hello"]);
		expect(exits).toEqual([{ exitCode: 0, signal: "SIGTERM" }]);
		expect(calls).toContainEqual({ write: "ls\n" });
		expect(calls).toContainEqual({ resize: [120, 40] });
		expect(calls).toContainEqual({ kill: "SIGTERM" });
		expect(calls).toContain("disposeData");
		expect(calls).toContain("disposeExit");
	});
});
