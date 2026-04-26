import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openAppServerDatabase, readEvents, runMigrations } from "..";
import { AccessPolicyService } from "./access-policy-service";
import { ApprovalService } from "./approval-service";
import { GuiConfigService } from "./gui-config-service";

test("GUI config persists access mode and arbitrary settings", () => {
	const dbPath = join(mkdtempSync(join(tmpdir(), "daedalus-config-")), "app.sqlite");
	let database = openAppServerDatabase(dbPath);
	runMigrations(database);
	new GuiConfigService(database).set("model.selected", "test-model");
	new AccessPolicyService(database).setMode("unrestricted");
	database.close();
	database = openAppServerDatabase(dbPath);
	runMigrations(database);
	expect(new GuiConfigService(database).get("model.selected")).toEqual({ "model.selected": "test-model" });
	expect(new AccessPolicyService(database).getPolicy()).toEqual({
		mode: "unrestricted",
		autoApproveSoftPrompts: true,
		bypassHardBlocks: false,
		auditRequired: true,
	});
	database.close();
});

test("unrestricted auto-approves soft approvals but not hard blocks", () => {
	const database = openAppServerDatabase(join(mkdtempSync(join(tmpdir(), "daedalus-approval-")), "app.sqlite"));
	runMigrations(database);
	const access = new AccessPolicyService(database);
	access.setMode("unrestricted");
	const approvals = new ApprovalService(database, access);

	expect(approvals.request({ id: "soft", request: { action: "edit" } })).toEqual({
		approvalId: "soft",
		autoApproved: true,
	});
	expect(approvals.request({ id: "hard", request: { action: "protected-path" }, hardBlock: true })).toEqual({
		approvalId: "hard",
		autoApproved: false,
	});
	const types = readEvents(database).map((event) => event.type);
	expect(types).toContain("access/changed");
	expect(types).toContain("approval/resolved");
	expect(types).toContain("access/auto-approved");
	database.close();
});
