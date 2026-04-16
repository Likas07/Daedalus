import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.js";
import { loadExtensions } from "../src/core/extensions/loader.js";
import { ExtensionRunner } from "../src/core/extensions/runner.js";
import { ModelRegistry } from "../src/core/model-registry.js";
import { SessionManager } from "../src/core/session-manager.js";

const tempDirs: string[] = [];

function createTempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "daedalus-input-test-"));
	tempDirs.push(dir);
	return dir;
}

async function createRunner(...extensions: string[]) {
	const tempDir = createTempDir();
	const extensionPaths = extensions.map((code, index) => {
		const extensionPath = path.join(tempDir, `${String(index).padStart(2, "0")}.ts`);
		fs.writeFileSync(extensionPath, code);
		return extensionPath;
	});
	const result = await loadExtensions(extensionPaths, tempDir);
	const sessionManager = SessionManager.inMemory();
	const modelRegistry = ModelRegistry.create(AuthStorage.create(path.join(tempDir, "auth.json")));
	return new ExtensionRunner(result.extensions, result.runtime, tempDir, sessionManager, modelRegistry);
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
	delete (globalThis as Record<string, unknown>).testVar;
});

describe("Input Event", () => {
	it("returns continue when no handlers, undefined return, or explicit continue", async () => {
		expect((await (await createRunner()).emitInput("x", undefined, "interactive")).action).toBe("continue");

		let runner = await createRunner(`export default p => p.on("input", async () => {});`);
		expect((await runner.emitInput("x", undefined, "interactive")).action).toBe("continue");

		runner = await createRunner(`export default p => p.on("input", async () => ({ action: "continue" }));`);
		expect((await runner.emitInput("x", undefined, "interactive")).action).toBe("continue");
	});

	it("transforms text and preserves images when omitted", async () => {
		const runner = await createRunner(
			`export default p => p.on("input", async e => ({ action: "transform", text: "T:" + e.text }));`,
		);
		const images = [{ type: "image" as const, data: "orig", mimeType: "image/png" }];
		expect(await runner.emitInput("hi", images, "interactive")).toEqual({
			action: "transform",
			text: "T:hi",
			images,
		});
	});

	it("transforms and replaces images when provided", async () => {
		const runner = await createRunner(
			`export default p => p.on("input", async () => ({ action: "transform", text: "X", images: [{ type: "image", data: "new", mimeType: "image/jpeg" }] }));`,
		);
		expect(
			await runner.emitInput("hi", [{ type: "image", data: "orig", mimeType: "image/png" }], "interactive"),
		).toEqual({
			action: "transform",
			text: "X",
			images: [{ type: "image", data: "new", mimeType: "image/jpeg" }],
		});
	});

	it("chains transforms across multiple handlers in explicit load order", async () => {
		const runner = await createRunner(
			`export default p => p.on("input", async e => ({ action: "transform", text: e.text + "[1]" }));`,
			`export default p => p.on("input", async e => ({ action: "transform", text: e.text + "[2]" }));`,
		);
		expect(await runner.emitInput("X", undefined, "interactive")).toEqual({
			action: "transform",
			text: "X[1][2]",
			images: undefined,
		});
	});

	it("short-circuits on handled and skips later handlers", async () => {
		(globalThis as Record<string, unknown>).testVar = false;
		const runner = await createRunner(
			`export default p => p.on("input", async () => ({ action: "handled" }));`,
			`export default p => p.on("input", async () => { globalThis.testVar = true; });`,
		);
		expect(await runner.emitInput("X", undefined, "interactive")).toEqual({ action: "handled" });
		expect((globalThis as Record<string, unknown>).testVar).toBe(false);
	});

	it("passes source correctly for all source types", async () => {
		const runner = await createRunner(
			`export default p => p.on("input", async e => { globalThis.testVar = e.source; return { action: "continue" }; });`,
		);
		for (const source of ["interactive", "rpc", "extension"] as const) {
			await runner.emitInput("x", undefined, source);
			expect((globalThis as Record<string, unknown>).testVar).toBe(source);
		}
	});

	it("catches handler errors and continues", async () => {
		const runner = await createRunner(`export default p => p.on("input", async () => { throw new Error("boom"); });`);
		const errors: string[] = [];
		runner.onError((error) => errors.push(error.error));
		const result = await runner.emitInput("x", undefined, "interactive");
		expect(result.action).toBe("continue");
		expect(errors).toContain("boom");
	});

	it("hasHandlers reflects whether input handlers are registered", async () => {
		let runner = await createRunner();
		expect(runner.hasHandlers("input")).toBe(false);

		runner = await createRunner(`export default p => p.on("input", async () => {});`);
		expect(runner.hasHandlers("input")).toBe(true);
	});
});
