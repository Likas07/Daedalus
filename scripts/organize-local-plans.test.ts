import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyLocalPlanMoves, planLocalPlanMoves } from "./organize-local-plans";

const roots: string[] = [];

function makeFixtureRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "daedalus-plan-organizer-"));
	roots.push(root);
	mkdirSync(join(root, "docs", "plans"), { recursive: true });
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("organize local plans", () => {
	it("moves dated markdown and sidecar pairs together", () => {
		const root = makeFixtureRoot();
		const plans = join(root, "docs", "plans");
		writeFileSync(join(plans, "2026-05-06-example.md"), "# Example\n");
		writeFileSync(
			join(plans, "2026-05-06-example.plan.json"),
			JSON.stringify({ markdownPath: join(plans, "2026-05-06-example.md"), markdownHash: "hash" }),
		);
		const planned = planLocalPlanMoves({ root, apply: false });
		expect(planned.errors).toEqual([]);
		expect(planned.moves[0]).toMatchObject({
			toMarkdown: join(plans, "2026_05_06", "example.md"),
			toSidecar: join(plans, "2026_05_06", "example.plan.json"),
		});
		applyLocalPlanMoves(planned.moves);
		expect(existsSync(join(plans, "2026_05_06", "example.md"))).toBe(true);
		expect(existsSync(join(plans, "2026_05_06", "example.plan.json"))).toBe(true);
		const sidecar = JSON.parse(readFileSync(join(plans, "2026_05_06", "example.plan.json"), "utf8"));
		expect(sidecar.markdownPath).toBe(join(plans, "2026_05_06", "example.md"));
		expect(sidecar.markdownHash).toBe("hash");
	});

	it("requires fallback date for non-dated markdown", () => {
		const root = makeFixtureRoot();
		const plans = join(root, "docs", "plans");
		writeFileSync(join(plans, "example.md"), "# Example\n");
		const withoutFallback = planLocalPlanMoves({ root, apply: false });
		expect(withoutFallback.moves).toEqual([]);
		expect(withoutFallback.skipped).toContain("non-dated markdown: example.md");
		const withFallback = planLocalPlanMoves({ root, apply: false, fallbackDate: "2026_05_06" });
		expect(withFallback.moves[0]?.toMarkdown).toBe(join(plans, "2026_05_06", "example.md"));
	});

	it("skips existing subdirectories without recursion", () => {
		const root = makeFixtureRoot();
		const plans = join(root, "docs", "plans");
		mkdirSync(join(plans, "implemented"));
		mkdirSync(join(plans, "optimization"));
		mkdirSync(join(plans, "2026_05_06"));
		writeFileSync(join(plans, "implemented", "2026-05-06-ignore.md"), "# Ignore\n");
		const planned = planLocalPlanMoves({ root, apply: false });
		expect(planned.moves).toEqual([]);
		expect(planned.skipped).toEqual(["directory: 2026_05_06", "directory: implemented", "directory: optimization"]);
	});

	it("reports orphan sidecars but does not move them", () => {
		const root = makeFixtureRoot();
		const plans = join(root, "docs", "plans");
		writeFileSync(join(plans, "2026-05-06-orphan.plan.json"), "{}\n");
		const planned = planLocalPlanMoves({ root, apply: false });
		expect(planned.moves).toEqual([]);
		expect(planned.errors).toContain("orphan sidecar: 2026-05-06-orphan.plan.json");
	});

	it("rejects collisions before moving any files", () => {
		const root = makeFixtureRoot();
		const plans = join(root, "docs", "plans");
		writeFileSync(join(plans, "2026-05-06-example.md"), "# Example\n");
		mkdirSync(join(plans, "2026_05_06"));
		writeFileSync(join(plans, "2026_05_06", "example.md"), "# Existing\n");
		const planned = planLocalPlanMoves({ root, apply: false });
		expect(planned.errors).toContain(`target exists: ${join(plans, "2026_05_06", "example.md")}`);
		expect(() => applyLocalPlanMoves(planned.moves)).toThrow("target exists");
		expect(existsSync(join(plans, "2026-05-06-example.md"))).toBe(true);
	});
});
