import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_DIR_NAME } from "../src/config.js";
import { SettingsManager } from "../src/core/settings-manager.js";

type Sandbox = {
	rootDir: string;
	agentDir: string;
	projectDir: string;
	projectSettingsPath: string;
	globalSettingsPath: string;
};

const tempDirs: string[] = [];

function createSandbox(): Sandbox {
	const rootDir = mkdtempSync(join(tmpdir(), "daedalus-settings-bug-"));
	const agentDir = join(rootDir, "agent");
	const projectDir = join(rootDir, "project");
	mkdirSync(agentDir, { recursive: true });
	mkdirSync(join(projectDir, CONFIG_DIR_NAME), { recursive: true });
	tempDirs.push(rootDir);
	return {
		rootDir,
		agentDir,
		projectDir,
		projectSettingsPath: join(projectDir, CONFIG_DIR_NAME, "settings.json"),
		globalSettingsPath: join(agentDir, "settings.json"),
	};
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		if (existsSync(dir)) {
			rmSync(dir, { recursive: true, force: true });
		}
	}
});

/**
 * Tests for the fix to a bug where external file changes to arrays were overwritten.
 */
describe("SettingsManager - External Edit Preservation", () => {
	it("preserves file changes to the packages array when changing an unrelated setting", async () => {
		const sandbox = createSandbox();
		writeFileSync(
			sandbox.globalSettingsPath,
			JSON.stringify({ theme: "dark", packages: ["npm:pi-mcp-adapter"] }),
		);

		const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);
		expect(manager.getPackages()).toEqual(["npm:pi-mcp-adapter"]);

		const currentSettings = JSON.parse(readFileSync(sandbox.globalSettingsPath, "utf-8"));
		currentSettings.packages = [];
		writeFileSync(sandbox.globalSettingsPath, JSON.stringify(currentSettings, null, 2));
		expect(JSON.parse(readFileSync(sandbox.globalSettingsPath, "utf-8")).packages).toEqual([]);

		manager.setTheme("light");
		await manager.flush();

		const savedSettings = JSON.parse(readFileSync(sandbox.globalSettingsPath, "utf-8"));
		expect(savedSettings.packages).toEqual([]);
		expect(savedSettings.theme).toBe("light");
	});

	it("preserves file changes to the extensions array when changing an unrelated setting", async () => {
		const sandbox = createSandbox();
		writeFileSync(
			sandbox.globalSettingsPath,
			JSON.stringify({ theme: "dark", extensions: ["/old/extension.ts"] }),
		);

		const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);

		const currentSettings = JSON.parse(readFileSync(sandbox.globalSettingsPath, "utf-8"));
		currentSettings.extensions = ["/new/extension.ts"];
		writeFileSync(sandbox.globalSettingsPath, JSON.stringify(currentSettings, null, 2));

		manager.setDefaultThinkingLevel("high");
		await manager.flush();

		const savedSettings = JSON.parse(readFileSync(sandbox.globalSettingsPath, "utf-8"));
		expect(savedSettings.extensions).toEqual(["/new/extension.ts"]);
	});

	it("preserves external project settings changes when updating an unrelated project field", async () => {
		const sandbox = createSandbox();
		writeFileSync(
			sandbox.projectSettingsPath,
			JSON.stringify({ extensions: ["./old-extension.ts"], prompts: ["./old-prompt.md"] }),
		);

		const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);

		const currentProjectSettings = JSON.parse(readFileSync(sandbox.projectSettingsPath, "utf-8"));
		currentProjectSettings.prompts = ["./new-prompt.md"];
		writeFileSync(sandbox.projectSettingsPath, JSON.stringify(currentProjectSettings, null, 2));

		manager.setProjectExtensionPaths(["./updated-extension.ts"]);
		await manager.flush();

		const savedProjectSettings = JSON.parse(readFileSync(sandbox.projectSettingsPath, "utf-8"));
		expect(savedProjectSettings.prompts).toEqual(["./new-prompt.md"]);
		expect(savedProjectSettings.extensions).toEqual(["./updated-extension.ts"]);
	});

	it("lets in-memory project changes override external changes for the same project field", async () => {
		const sandbox = createSandbox();
		writeFileSync(
			sandbox.projectSettingsPath,
			JSON.stringify({ extensions: ["./initial-extension.ts"] }),
		);

		const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);

		const currentProjectSettings = JSON.parse(readFileSync(sandbox.projectSettingsPath, "utf-8"));
		currentProjectSettings.extensions = ["./external-extension.ts"];
		writeFileSync(sandbox.projectSettingsPath, JSON.stringify(currentProjectSettings, null, 2));

		manager.setProjectExtensionPaths(["./in-memory-extension.ts"]);
		await manager.flush();

		const savedProjectSettings = JSON.parse(readFileSync(sandbox.projectSettingsPath, "utf-8"));
		expect(savedProjectSettings.extensions).toEqual(["./in-memory-extension.ts"]);
	});
});
