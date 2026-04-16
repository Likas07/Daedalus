import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_DIR_NAME } from "../src/config.js";
import { SettingsManager } from "../src/core/settings-manager.js";

type Sandbox = {
	rootDir: string;
	agentDir: string;
	projectDir: string;
	projectSettingsDir: string;
	globalSettingsPath: string;
	projectSettingsPath: string;
};

const tempDirs: string[] = [];

function createSandbox(): Sandbox {
	const rootDir = mkdtempSync(join(tmpdir(), "daedalus-settings-"));
	const agentDir = join(rootDir, "agent");
	const projectDir = join(rootDir, "project");
	const projectSettingsDir = join(projectDir, CONFIG_DIR_NAME);
	mkdirSync(agentDir, { recursive: true });
	mkdirSync(projectSettingsDir, { recursive: true });
	tempDirs.push(rootDir);
	return {
		rootDir,
		agentDir,
		projectDir,
		projectSettingsDir,
		globalSettingsPath: join(agentDir, "settings.json"),
		projectSettingsPath: join(projectSettingsDir, "settings.json"),
	};
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("SettingsManager", () => {
	describe("preserves externally added settings", () => {
		it("preserves enabledModels when changing thinking level", async () => {
			const sandbox = createSandbox();
			writeFileSync(
				sandbox.globalSettingsPath,
				JSON.stringify({
					theme: "dark",
					defaultModel: "claude-sonnet",
				}),
			);

			const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);

			const currentSettings = JSON.parse(readFileSync(sandbox.globalSettingsPath, "utf-8"));
			currentSettings.enabledModels = ["claude-opus-4-5", "gpt-5.2-codex"];
			writeFileSync(sandbox.globalSettingsPath, JSON.stringify(currentSettings, null, 2));

			manager.setDefaultThinkingLevel("high");
			await manager.flush();

			const savedSettings = JSON.parse(readFileSync(sandbox.globalSettingsPath, "utf-8"));
			expect(savedSettings.enabledModels).toEqual(["claude-opus-4-5", "gpt-5.2-codex"]);
			expect(savedSettings.defaultThinkingLevel).toBe("high");
			expect(savedSettings.theme).toBe("dark");
			expect(savedSettings.defaultModel).toBe("claude-sonnet");
		});

		it("preserves custom settings when changing theme", async () => {
			const sandbox = createSandbox();
			writeFileSync(sandbox.globalSettingsPath, JSON.stringify({ defaultModel: "claude-sonnet" }));

			const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);

			const currentSettings = JSON.parse(readFileSync(sandbox.globalSettingsPath, "utf-8"));
			currentSettings.shellPath = "/bin/zsh";
			currentSettings.extensions = ["/path/to/extension.ts"];
			writeFileSync(sandbox.globalSettingsPath, JSON.stringify(currentSettings, null, 2));

			manager.setTheme("light");
			await manager.flush();

			const savedSettings = JSON.parse(readFileSync(sandbox.globalSettingsPath, "utf-8"));
			expect(savedSettings.shellPath).toBe("/bin/zsh");
			expect(savedSettings.extensions).toEqual(["/path/to/extension.ts"]);
			expect(savedSettings.theme).toBe("light");
		});

		it("lets in-memory changes override file changes for the same key", async () => {
			const sandbox = createSandbox();
			writeFileSync(sandbox.globalSettingsPath, JSON.stringify({ theme: "dark" }));

			const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);

			const currentSettings = JSON.parse(readFileSync(sandbox.globalSettingsPath, "utf-8"));
			currentSettings.defaultThinkingLevel = "low";
			writeFileSync(sandbox.globalSettingsPath, JSON.stringify(currentSettings, null, 2));

			manager.setDefaultThinkingLevel("high");
			await manager.flush();

			const savedSettings = JSON.parse(readFileSync(sandbox.globalSettingsPath, "utf-8"));
			expect(savedSettings.defaultThinkingLevel).toBe("high");
		});
	});

	describe("packages migration", () => {
		it("keeps local-only extensions in the extensions array", () => {
			const sandbox = createSandbox();
			writeFileSync(
				sandbox.globalSettingsPath,
				JSON.stringify({ extensions: ["/local/ext.ts", "./relative/ext.ts"] }),
			);

			const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);

			expect(manager.getPackages()).toEqual([]);
			expect(manager.getExtensionPaths()).toEqual(["/local/ext.ts", "./relative/ext.ts"]);
		});

		it("handles packages with filtering objects", () => {
			const sandbox = createSandbox();
			writeFileSync(
				sandbox.globalSettingsPath,
				JSON.stringify({
					packages: [
						"npm:simple-pkg",
						{
							source: "npm:shitty-extensions",
							extensions: ["extensions/oracle.ts"],
							skills: [],
						},
					],
				}),
			);

			const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);
			const packages = manager.getPackages();
			expect(packages).toHaveLength(2);
			expect(packages[0]).toBe("npm:simple-pkg");
			expect(packages[1]).toEqual({
				source: "npm:shitty-extensions",
				extensions: ["extensions/oracle.ts"],
				skills: [],
			});
		});
	});

	describe("reload", () => {
		it("reloads global settings from disk", async () => {
			const sandbox = createSandbox();
			writeFileSync(sandbox.globalSettingsPath, JSON.stringify({ theme: "dark", extensions: ["/before.ts"] }));

			const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);
			writeFileSync(
				sandbox.globalSettingsPath,
				JSON.stringify({ theme: "light", extensions: ["/after.ts"], defaultModel: "claude-sonnet" }),
			);

			await manager.reload();

			expect(manager.getTheme()).toBe("light");
			expect(manager.getExtensionPaths()).toEqual(["/after.ts"]);
			expect(manager.getDefaultModel()).toBe("claude-sonnet");
		});

		it("keeps previous settings when the file is invalid", async () => {
			const sandbox = createSandbox();
			writeFileSync(sandbox.globalSettingsPath, JSON.stringify({ theme: "dark" }));

			const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);
			writeFileSync(sandbox.globalSettingsPath, "{ invalid json");

			await manager.reload();
			expect(manager.getTheme()).toBe("dark");
		});
	});

	describe("error tracking", () => {
		it("collects and clears load errors via drainErrors", () => {
			const sandbox = createSandbox();
			writeFileSync(sandbox.globalSettingsPath, "{ invalid global json");
			writeFileSync(sandbox.projectSettingsPath, "{ invalid project json");

			const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);
			const errors = manager.drainErrors();

			expect(errors).toHaveLength(2);
			expect(errors.map((entry) => entry.scope).sort()).toEqual(["global", "project"]);
			expect(manager.drainErrors()).toEqual([]);
		});
	});

	describe("project settings directory creation", () => {
		it("does not create the project config dir when only reading project settings", () => {
			const sandbox = createSandbox();
			writeFileSync(sandbox.globalSettingsPath, JSON.stringify({ theme: "dark" }));
			rmSync(sandbox.projectSettingsDir, { recursive: true, force: true });

			const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);

			expect(existsSync(sandbox.projectSettingsDir)).toBe(false);
			expect(manager.getTheme()).toBe("dark");
		});

		it("creates the project config dir when writing project settings", async () => {
			const sandbox = createSandbox();
			writeFileSync(sandbox.globalSettingsPath, JSON.stringify({ theme: "dark" }));
			rmSync(sandbox.projectSettingsDir, { recursive: true, force: true });

			const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);
			expect(existsSync(sandbox.projectSettingsDir)).toBe(false);

			manager.setProjectPackages([{ source: "npm:test-pkg" }]);
			await manager.flush();

			expect(existsSync(sandbox.projectSettingsDir)).toBe(true);
			expect(existsSync(sandbox.projectSettingsPath)).toBe(true);
		});
	});

	describe("shellCommandPrefix", () => {
		it("loads shellCommandPrefix from settings", () => {
			const sandbox = createSandbox();
			writeFileSync(sandbox.globalSettingsPath, JSON.stringify({ shellCommandPrefix: "shopt -s expand_aliases" }));

			const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);
			expect(manager.getShellCommandPrefix()).toBe("shopt -s expand_aliases");
		});

		it("returns undefined when shellCommandPrefix is not set", () => {
			const sandbox = createSandbox();
			writeFileSync(sandbox.globalSettingsPath, JSON.stringify({ theme: "dark" }));

			const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);
			expect(manager.getShellCommandPrefix()).toBeUndefined();
		});

		it("preserves shellCommandPrefix when saving unrelated settings", async () => {
			const sandbox = createSandbox();
			writeFileSync(sandbox.globalSettingsPath, JSON.stringify({ shellCommandPrefix: "shopt -s expand_aliases" }));

			const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);
			manager.setTheme("light");
			await manager.flush();

			const savedSettings = JSON.parse(readFileSync(sandbox.globalSettingsPath, "utf-8"));
			expect(savedSettings.shellCommandPrefix).toBe("shopt -s expand_aliases");
			expect(savedSettings.theme).toBe("light");
		});
	});

	describe("getSessionDir", () => {
		it("returns undefined when not set", () => {
			const sandbox = createSandbox();
			writeFileSync(sandbox.globalSettingsPath, JSON.stringify({ theme: "dark" }));
			const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);
			expect(manager.getSessionDir()).toBeUndefined();
		});

		it("returns the global sessionDir", () => {
			const sandbox = createSandbox();
			writeFileSync(sandbox.globalSettingsPath, JSON.stringify({ sessionDir: "/tmp/sessions" }));
			const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);
			expect(manager.getSessionDir()).toBe("/tmp/sessions");
		});

		it("returns the project sessionDir and overrides the global value", () => {
			const sandbox = createSandbox();
			writeFileSync(sandbox.globalSettingsPath, JSON.stringify({ sessionDir: "/global/sessions" }));
			writeFileSync(sandbox.projectSettingsPath, JSON.stringify({ sessionDir: "./sessions" }));
			const manager = SettingsManager.create(sandbox.projectDir, sandbox.agentDir);
			expect(manager.getSessionDir()).toBe("./sessions");
		});
	});
});
