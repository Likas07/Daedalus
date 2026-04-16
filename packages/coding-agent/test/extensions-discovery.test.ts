import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_DIR_NAME } from "../src/config.js";
import { discoverAndLoadExtensions, loadExtensions } from "../src/core/extensions/loader.js";

type Sandbox = {
	rootDir: string;
	cwd: string;
	agentDir: string;
	localExtensionsDir: string;
};

const tempDirs: string[] = [];

function createSandbox(): Sandbox {
	const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "daedalus-ext-discovery-"));
	const cwd = path.join(rootDir, "project");
	const agentDir = path.join(rootDir, "agent");
	const localExtensionsDir = path.join(cwd, CONFIG_DIR_NAME, "extensions");
	fs.mkdirSync(localExtensionsDir, { recursive: true });
	fs.mkdirSync(agentDir, { recursive: true });
	tempDirs.push(rootDir);
	return { rootDir, cwd, agentDir, localExtensionsDir };
}

async function discoverLocalExtensions(sandbox: Sandbox, configuredPaths: string[] = []) {
	return discoverAndLoadExtensions(configuredPaths, sandbox.cwd, sandbox.agentDir);
}

function writeLocalExtension(sandbox: Sandbox, relativePath: string, content: string): string {
	const targetPath = path.join(sandbox.localExtensionsDir, relativePath);
	fs.mkdirSync(path.dirname(targetPath), { recursive: true });
	fs.writeFileSync(targetPath, content);
	return targetPath;
}

function commandExtensionCode(commandName = "test"): string {
	return `
		export default function(pi) {
			pi.registerCommand("${commandName}", { description: "Test command", handler: async () => {} });
		}
	`;
}

function toolExtensionCode(toolName: string): string {
	return `
		export default function(pi) {
			pi.registerTool({
				name: "${toolName}",
				label: "${toolName}",
				description: "Test tool",
				parameters: { type: "object", properties: {} },
				execute: async () => ({ content: [{ type: "text", text: "ok" }], details: {} }),
			});
		}
	`;
}


afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("extensions discovery", () => {
	it("discovers direct .ts and .js files in the project extensions directory", async () => {
		const sandbox = createSandbox();
		writeLocalExtension(sandbox, "foo.ts", commandExtensionCode("foo"));
		writeLocalExtension(sandbox, "bar.js", commandExtensionCode("bar"));

		const result = await discoverLocalExtensions(sandbox);

		expect(result.errors).toEqual([]);
		expect(result.extensions.map((extension) => path.basename(extension.path)).sort()).toEqual(["bar.js", "foo.ts"]);
	});

	it("discovers subdirectories via index.ts or index.js", async () => {
		const sandbox = createSandbox();
		writeLocalExtension(sandbox, "with-ts/index.ts", commandExtensionCode("ts-index"));
		writeLocalExtension(sandbox, "with-js/index.js", commandExtensionCode("js-index"));

		const result = await discoverLocalExtensions(sandbox);

		expect(result.errors).toEqual([]);
		expect(result.extensions).toHaveLength(2);
		expect(result.extensions.some((extension) => extension.path.endsWith("with-ts/index.ts"))).toBe(true);
		expect(result.extensions.some((extension) => extension.path.endsWith("with-js/index.js"))).toBe(true);
	});

	it("prefers package manifests over index files and supports multiple manifest entries", async () => {
		const sandbox = createSandbox();
		const packageDir = path.join(sandbox.localExtensionsDir, "manifest-package");
		fs.mkdirSync(packageDir, { recursive: true });
		fs.writeFileSync(path.join(packageDir, "index.ts"), toolExtensionCode("from-index"));
		fs.writeFileSync(path.join(packageDir, "custom-a.ts"), toolExtensionCode("from-custom-a"));
		fs.writeFileSync(path.join(packageDir, "custom-b.ts"), toolExtensionCode("from-custom-b"));
		fs.writeFileSync(
			path.join(packageDir, "package.json"),
			JSON.stringify({
				name: "manifest-package",
				pi: { extensions: ["./custom-a.ts", "./custom-b.ts"] },
			}),
		);

		const result = await discoverLocalExtensions(sandbox);

		expect(result.errors).toEqual([]);
		expect(result.extensions).toHaveLength(2);
		expect(result.extensions.every((extension) => !extension.path.endsWith("index.ts"))).toBe(true);
		expect(result.extensions.some((extension) => extension.tools.has("from-custom-a"))).toBe(true);
		expect(result.extensions.some((extension) => extension.tools.has("from-custom-b"))).toBe(true);
	});

	it("falls back to index.ts when package.json has no extension manifest", async () => {
		const sandbox = createSandbox();
		const packageDir = path.join(sandbox.localExtensionsDir, "fallback-package");
		fs.mkdirSync(packageDir, { recursive: true });
		fs.writeFileSync(path.join(packageDir, "index.ts"), commandExtensionCode("fallback"));
		fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({ name: "fallback-package" }));

		const result = await discoverLocalExtensions(sandbox);

		expect(result.errors).toEqual([]);
		expect(result.extensions).toHaveLength(1);
		expect(result.extensions[0]?.path).toContain("index.ts");
	});

	it("skips missing manifest entries and subdirectories without entries", async () => {
		const sandbox = createSandbox();
		const packageDir = path.join(sandbox.localExtensionsDir, "partial-package");
		fs.mkdirSync(packageDir, { recursive: true });
		fs.writeFileSync(path.join(packageDir, "exists.ts"), commandExtensionCode("exists"));
		fs.writeFileSync(
			path.join(packageDir, "package.json"),
			JSON.stringify({ pi: { extensions: ["./exists.ts", "./missing.ts"] } }),
		);
		const emptyDir = path.join(sandbox.localExtensionsDir, "not-an-extension");
		fs.mkdirSync(emptyDir, { recursive: true });
		fs.writeFileSync(path.join(emptyDir, "helper.ts"), commandExtensionCode("ignored"));

		const result = await discoverLocalExtensions(sandbox);

		expect(result.errors).toEqual([]);
		expect(result.extensions).toHaveLength(1);
		expect(result.extensions[0]?.path).toContain("exists.ts");
	});

	it("does not recurse beyond one level", async () => {
		const sandbox = createSandbox();
		writeLocalExtension(sandbox, "container/nested/index.ts", commandExtensionCode("nested"));

		const result = await discoverLocalExtensions(sandbox);

		expect(result.errors).toEqual([]);
		expect(result.extensions).toHaveLength(0);
	});

	it("handles mixed direct files and package directories", async () => {
		const sandbox = createSandbox();
		writeLocalExtension(sandbox, "direct.ts", commandExtensionCode("direct"));
		writeLocalExtension(sandbox, "with-index/index.ts", commandExtensionCode("with-index"));
		const packageDir = path.join(sandbox.localExtensionsDir, "with-manifest");
		fs.mkdirSync(packageDir, { recursive: true });
		fs.writeFileSync(path.join(packageDir, "entry.ts"), commandExtensionCode("with-manifest"));
		fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({ pi: { extensions: ["./entry.ts"] } }));

		const result = await discoverLocalExtensions(sandbox);

		expect(result.errors).toEqual([]);
		expect(result.extensions).toHaveLength(3);
		expect(result.extensions.flatMap((extension) => [...extension.commands.keys()]).sort()).toEqual([
			"direct",
			"with-index",
			"with-manifest",
		]);
	});

	it("loads discovered extensions that register commands, tools, renderers, handlers, shortcuts, and flags", async () => {
		const sandbox = createSandbox();
		writeLocalExtension(sandbox, "with-command.ts", commandExtensionCode("test-command"));
		writeLocalExtension(sandbox, "with-tool.ts", toolExtensionCode("test-tool"));
		writeLocalExtension(
			sandbox,
			"with-renderer.ts",
			`export default function(pi) { pi.registerMessageRenderer("my-type", () => null); }`,
		);
		writeLocalExtension(
			sandbox,
			"with-handlers.ts",
			`export default function(pi) { pi.on("agent_start", async () => {}); pi.on("tool_call", async () => undefined); }`,
		);
		writeLocalExtension(
			sandbox,
			"with-shortcut.ts",
			`export default function(pi) { pi.registerShortcut("ctrl+t", { description: "shortcut", handler: async () => {} }); }`,
		);
		writeLocalExtension(
			sandbox,
			"with-flag.ts",
			`export default function(pi) { pi.registerFlag("my-flag", { description: "flag", type: "boolean", default: true }); }`,
		);

		const result = await discoverLocalExtensions(sandbox);

		expect(result.errors).toEqual([]);
		expect(result.extensions).toHaveLength(6);
		expect(result.extensions.some((extension) => extension.commands.has("test-command"))).toBe(true);
		expect(result.extensions.some((extension) => extension.tools.has("test-tool"))).toBe(true);
		expect(result.extensions.some((extension) => extension.messageRenderers.has("my-type"))).toBe(true);
		expect(result.extensions.some((extension) => extension.handlers.has("agent_start"))).toBe(true);
		expect(result.extensions.some((extension) => extension.shortcuts.has("ctrl+t"))).toBe(true);
		expect(result.extensions.some((extension) => extension.flags.has("my-flag"))).toBe(true);
	});

	it("surfaces extension load errors for invalid code, thrown initialization, and missing default export", async () => {
		const sandbox = createSandbox();
		writeLocalExtension(sandbox, "invalid.ts", "this is not valid typescript export");
		writeLocalExtension(sandbox, "throws.ts", `export default function() { throw new Error("Initialization failed!"); }`);
		writeLocalExtension(sandbox, "no-default.ts", `export function notDefault() {}`);

		const result = await discoverLocalExtensions(sandbox);

		expect(result.extensions).toHaveLength(0);
		expect(result.errors).toHaveLength(3);
		expect(result.errors.some((entry) => entry.path.includes("invalid.ts"))).toBe(true);
		expect(result.errors.some((entry) => entry.error.includes("Initialization failed!"))).toBe(true);
		expect(result.errors.some((entry) => entry.error.includes("does not export a valid factory function"))).toBe(true);
	});

	it("handles explicitly configured files and directories", async () => {
		const sandbox = createSandbox();
		const explicitFile = path.join(sandbox.rootDir, "custom-location", "my-ext.ts");
		fs.mkdirSync(path.dirname(explicitFile), { recursive: true });
		fs.writeFileSync(explicitFile, commandExtensionCode("explicit-file"));

		const explicitDir = path.join(sandbox.rootDir, "dir-ext");
		fs.mkdirSync(explicitDir, { recursive: true });
		fs.writeFileSync(path.join(explicitDir, "entry.ts"), commandExtensionCode("explicit-dir"));
		fs.writeFileSync(path.join(explicitDir, "package.json"), JSON.stringify({ pi: { extensions: ["./entry.ts"] } }));

		const result = await discoverLocalExtensions(sandbox, [explicitFile, explicitDir]);

		expect(result.errors).toEqual([]);
		expect(result.extensions.flatMap((extension) => [...extension.commands.keys()]).sort()).toEqual([
			"explicit-dir",
			"explicit-file",
		]);
	});

	it("resolves dependencies from an extension's own node_modules", async () => {
		const sandbox = createSandbox();
		const extensionDir = path.join(sandbox.rootDir, "with-deps");
		fs.mkdirSync(path.join(extensionDir, "node_modules", "ms"), { recursive: true });
		fs.writeFileSync(
			path.join(extensionDir, "package.json"),
			JSON.stringify({ name: "with-deps", pi: { extensions: ["./index.ts"] } }),
		);
		fs.writeFileSync(
			path.join(extensionDir, "node_modules", "ms", "package.json"),
			JSON.stringify({ name: "ms", main: "index.js" }),
		);
		fs.writeFileSync(
			path.join(extensionDir, "node_modules", "ms", "index.js"),
			"module.exports = function ms(value) { return value === '2h' ? 7200000 : undefined; };",
		);
		fs.writeFileSync(
			path.join(extensionDir, "index.ts"),
			`import ms from "ms"; export default function(pi) { pi.registerTool({ name: "parse_duration", label: "parse_duration", description: "Parse duration", parameters: { type: "object", properties: { duration: { type: "string" } }, required: ["duration"] }, execute: async (_id, params) => ({ content: [{ type: "text", text: String(ms(params.duration)) }], details: {} }), }); }`,
		);

		const result = await discoverLocalExtensions(sandbox, [extensionDir]);

		expect(result.errors).toEqual([]);
		expect(result.extensions).toHaveLength(1);
		expect(result.extensions[0]?.tools.has("parse_duration")).toBe(true);
	});

	it("loadExtensions only loads explicit paths without discovery", async () => {
		const sandbox = createSandbox();
		writeLocalExtension(sandbox, "discovered.ts", toolExtensionCode("discovered"));
		const explicitPath = path.join(sandbox.rootDir, "explicit.ts");
		fs.writeFileSync(explicitPath, toolExtensionCode("explicit"));

		const result = await loadExtensions([explicitPath], sandbox.cwd);

		expect(result.errors).toEqual([]);
		expect(result.extensions).toHaveLength(1);
		expect(result.extensions[0]?.tools.has("explicit")).toBe(true);
		expect(result.extensions[0]?.tools.has("discovered")).toBe(false);
	});

	it("loadExtensions with no paths loads nothing", async () => {
		const sandbox = createSandbox();
		writeLocalExtension(sandbox, "discovered.ts", commandExtensionCode("discovered"));

		const result = await loadExtensions([], sandbox.cwd);

		expect(result.errors).toEqual([]);
		expect(result.extensions).toEqual([]);
	});
});
