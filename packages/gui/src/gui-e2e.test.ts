import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("GUI E2E projection coverage contract", () => {
	test("web smoke and GUI tests cover active Thread projection UX and T3Code near-port docs", () => {
		const smoke = readFileSync(join(import.meta.dir, "../test/e2e/web-gui-smoke.test.ts"), "utf8");
		const app = readFileSync(join(import.meta.dir, "app.test.ts"), "utf8");
		const docs = readFileSync(join(import.meta.dir, "../../../docs/gui/shell-detail-projections.md"), "utf8");

		expect(smoke).toContain("shell/snapshot");
		expect(smoke).toContain("thread/snapshot");
		expect(app).toContain("Thread projection UX source renders chat bubbles");
		expect(app).toContain("streaming-indicator");
		expect(app).toContain("ComposerPendingActions");
		expect(docs).toContain("/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/ChatView.tsx");
		expect(docs).toContain("Snapshot-first subscription flow");
		expect(docs).toContain("Audit ledger location");
	});
});
