import { describe, expect, it } from "vitest";
import { createSubagentTools, isSubagentSpawnAllowed } from "../src/core/subagents/policy.js";

const scoutPolicy = {
	allowedTools: ["read", "write"],
	writableGlobs: ["/repo/src/**"],
	readableGlobs: ["/repo/src/**", "/repo/README.md"],
	spawns: ["worker"],
	maxDepth: 1,
} as const;

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
});

describe("isSubagentSpawnAllowed", () => {
	it("allows only configured child agent names unless wildcard is used", () => {
		expect(isSubagentSpawnAllowed(["scout", "worker"], "worker")).toBe(true);
		expect(isSubagentSpawnAllowed(["scout", "worker"], "reviewer")).toBe(false);
		expect(isSubagentSpawnAllowed("*", "reviewer")).toBe(true);
	});
});
