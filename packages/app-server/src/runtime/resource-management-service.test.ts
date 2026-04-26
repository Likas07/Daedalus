import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ResourceManagementService } from "./resource-management-service";

describe("ResourceManagementService", () => {
	test("lists resources with diagnostics, badges, and source paths", () => {
		const root = mkdtempSync(join(tmpdir(), "dae-resources-"));
		mkdirSync(join(root, "extensions"), { recursive: true });
		mkdirSync(join(root, "skills"), { recursive: true });
		mkdirSync(join(root, "prompts"), { recursive: true });
		mkdirSync(join(root, "themes"), { recursive: true });
		writeFileSync(join(root, "extensions", "reviewer.ts"), "export default {};");
		writeFileSync(join(root, "skills", "debug.disabled"), "");
		writeFileSync(join(root, "prompts", "commit.md"), "commit");
		writeFileSync(join(root, "themes", "ember.json"), "{}");
		const result = new ResourceManagementService({ globalDir: root }).list();
		expect(result.resources.map((r) => `${r.kind}:${r.id}`)).toContain("extension:reviewer");
		expect(result.resources.find((r) => r.id === "debug")?.disabledReason).toBe("Disabled on disk");
		expect(result.resources.every((r) => typeof r.sourcePath === "string")).toBe(true);
	});

	test("reload and operations return resource state", () => {
		const service = new ResourceManagementService();
		expect(service.reload().resources).toEqual([]);
		expect(service.install({ kind: "theme", id: "obsidian" }).enabled).toBe(true);
		expect(service.disable({ kind: "skill", id: "writer" }).disabledReason).toContain("Disabled");
		expect(service.enable({ kind: "skill", id: "writer" }).status).toBe("enabled");
		expect(service.update({ kind: "package", id: "pkg" }).kind).toBe("package");
		expect(service.remove({ kind: "package", id: "pkg" })).toEqual({ ok: true });
	});
});
