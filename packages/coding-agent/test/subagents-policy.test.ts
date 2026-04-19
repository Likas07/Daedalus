import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSubagentTools, isSubagentSpawnAllowed } from "../src/core/subagents/policy.js";
import { getBundledStarterAgents } from "../src/extensions/daedalus/workflow/subagents/bundled.js";

const scoutPolicy = {
	allowedTools: ["read", "write"],
	writableGlobs: ["/repo/src/**"],
	readableGlobs: ["/repo/src/**", "/repo/README.md"],
	spawns: ["worker"],
	maxDepth: 1,
} as const;

const tempDirs: string[] = [];

function createTempRepo(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "daedalus-subagent-policy-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("createSubagentTools", () => {
	it("blocks reads outside readableGlobs", async () => {
		const read = createSubagentTools("/repo", scoutPolicy).find((tool) => tool.name === "read");
		await expect(read!.execute("tool-1", { path: "../secret.txt" }, undefined, undefined)).rejects.toThrow(
			"Reads from",
		);
	});

	it("blocks writes outside writableGlobs", async () => {
		const write = createSubagentTools("/repo", scoutPolicy).find((tool) => tool.name === "write");
		await expect(
			write!.execute("tool-2", { path: "../secret.txt", content: "nope" }, undefined, undefined),
		).rejects.toThrow("Writes to");
	});

	it("includes the skill tool only when explicitly allowed and loads project skills", async () => {
		const cwd = createTempRepo();
		const skillDir = path.join(cwd, ".daedalus", "skills", "caveman");
		fs.mkdirSync(skillDir, { recursive: true });
		fs.writeFileSync(
			path.join(skillDir, "SKILL.md"),
			"---\nname: caveman\ndescription: Talk less.\n---\nUse fewer words.\n",
		);

		const withoutSkill = createSubagentTools(cwd, {
			allowedTools: ["read"],
			writableGlobs: [],
			spawns: [],
			maxDepth: 1,
		});
		expect(withoutSkill.some((tool) => tool.name === "skill")).toBe(false);

		const withSkill = createSubagentTools(cwd, {
			allowedTools: ["skill"],
			writableGlobs: [],
			spawns: [],
			maxDepth: 1,
		});
		const skill = withSkill.find((tool) => tool.name === "skill");

		expect(skill).toBeDefined();
		const result = await skill!.execute("tool-3", { action: "load", name: "caveman" }, undefined, undefined);
		const text = result.content[0];
		const content = text && typeof text === "object" && "type" in text && text.type === "text" ? text.text : "";
		expect(content).toContain('<skill name="caveman"');
		expect(content).toContain("Use fewer words.");
	});
});

describe("bundled starter agent policies", () => {
	it("grants skill to planner and worker only", () => {
		const policies = new Map(
			getBundledStarterAgents().map((agent) => [agent.name, agent.toolPolicy?.allowedTools ?? []]),
		);

		expect(policies.get("planner")).toContain("skill");
		expect(policies.get("worker")).toContain("skill");
		expect(policies.get("scout")).not.toContain("skill");
		expect(policies.get("reviewer")).not.toContain("skill");
	});
});

describe("isSubagentSpawnAllowed", () => {
	it("allows only configured child agent names unless wildcard is used", () => {
		expect(isSubagentSpawnAllowed(["scout", "worker"], "worker")).toBe(true);
		expect(isSubagentSpawnAllowed(["scout", "worker"], "reviewer")).toBe(false);
		expect(isSubagentSpawnAllowed("*", "reviewer")).toBe(true);
	});
});
