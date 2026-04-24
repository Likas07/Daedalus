import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCustomMessage } from "../../src/core/messages.js";
import { type CustomMessageEntry, SessionManager } from "../../src/core/session-manager.js";

describe("droppable custom message flag", () => {
	it("createCustomMessage preserves droppable flag from options", () => {
		const msg = createCustomMessage("ctx", "hidden", false, undefined, new Date(0).toISOString(), {
			droppable: true,
		});
		expect(msg.droppable).toBe(true);
	});

	it("CustomMessageEntry accepts serialized droppable flag", () => {
		const entry: CustomMessageEntry = {
			type: "custom_message",
			id: "1",
			parentId: null,
			timestamp: new Date(0).toISOString(),
			customType: "ctx",
			content: "hidden",
			display: false,
			droppable: true,
		};
		expect(JSON.parse(JSON.stringify(entry)).droppable).toBe(true);
	});

	it("appendCustomMessageEntry persists droppable flag", () => {
		const dir = mkdtempSync(join(tmpdir(), "daedalus-droppable-"));
		const manager = SessionManager.create("/w", dir);
		const id = manager.appendCustomMessageEntry("ctx", "hidden", false, undefined, { droppable: true });
		const entry = manager.getEntry(id) as CustomMessageEntry;
		expect(entry.droppable).toBe(true);
	});
});
