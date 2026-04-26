import { describe, expect, test } from "bun:test";
import { executeSlashCommand, listSlashCommands, normalizeSlashCommand } from "./slash-command-executor";

describe("slash-command-executor", () => {
	test("normalizes and exposes disabled states", () => {
		expect(normalizeSlashCommand("/settings now")).toBe("settings");
		expect(listSlashCommands([{ name: "x", label: "X", source: "extension", disabled: true, disabledReason: "missing" } as never])[0]).toMatchObject({ disabled: true, disabledReason: "missing" });
	});

	test("maps built-ins to GUI and runtime actions", async () => {
		let settings = false;
		let reloaded = false;
		expect(await executeSlashCommand("/settings", { openSettings: () => { settings = true; } })).toMatchObject({ action: "gui" });
		expect(settings).toBe(true);
		expect(await executeSlashCommand("/reload", { reloadResources: () => { reloaded = true; } })).toMatchObject({ action: "runtime" });
		expect(reloaded).toBe(true);
	});

	test("passes extension, skill, and prompt-template commands to agent execution", async () => {
		expect(await executeSlashCommand({ name: "review", label: "Review", source: "skill" })).toMatchObject({ action: "submit", prompt: "/review" });
		expect(await executeSlashCommand({ name: "commit", label: "Commit", source: "prompt-template" })).toMatchObject({ action: "submit" });
		expect(await executeSlashCommand({ name: "ext", label: "Extension", source: "extension" })).toMatchObject({ action: "submit" });
	});
});
