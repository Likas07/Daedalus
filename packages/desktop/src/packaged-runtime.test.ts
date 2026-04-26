import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePackagedAppServerRuntime } from "./server-process";

const cleanup: string[] = [];

afterEach(async () => {
	for (const dir of cleanup.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function tempResources(): Promise<string> {
	const dir = join(tmpdir(), `daedalus-packaged-runtime-${crypto.randomUUID()}`);
	cleanup.push(dir);
	await mkdir(join(dir, "app-server"), { recursive: true });
	return dir;
}

describe("packaged app-server runtime", () => {
	test("prefers staged compiled app-server binary", async () => {
		const resources = await tempResources();
		const binary = join(resources, "app-server", process.platform === "win32" ? "daedalus-app-server.exe" : "daedalus-app-server");
		await writeFile(binary, "#!/bin/sh\n", { mode: 0o755 });

		expect(resolvePackagedAppServerRuntime({ resourcesPath: resources })).toEqual({
			command: binary,
			args: [],
			kind: "binary",
		});
	});

	test("uses Bun script fallback when compile artifact is unavailable", async () => {
		const resources = await tempResources();
		const fallback = join(resources, "app-server", "main.ts");
		await writeFile(fallback, "console.log('ready')\n");

		expect(resolvePackagedAppServerRuntime({ resourcesPath: resources })).toEqual({
			command: "bun",
			args: [fallback],
			kind: "bun-script",
		});
	});
});
