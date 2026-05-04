import { describe, expect, test } from "vitest";
import {
	createDaedalusComposerAdapter,
	toDaedalusAttachmentSaveParams,
	toDaedalusCommandListParams,
	toDaedalusFileSearchParams,
} from "./daedalusComposer";

describe("daedalusComposer", () => {
	test("maps file mention search to composer/file-search params", () => {
		expect(
			toDaedalusFileSearchParams({ projectId: "project-1", worktreeId: "wt-1", query: "src", limit: 10 }),
		).toEqual({
			projectId: "project-1",
			worktreeId: "wt-1",
			query: "src",
			limit: 10,
		});
	});

	test("maps slash command list to composer/command-list params", () => {
		expect(toDaedalusCommandListParams({ sessionId: "session-1" })).toEqual({ sessionId: "session-1" });
		expect(toDaedalusCommandListParams()).toEqual({});
	});

	test("maps attachment save to composer/attachment/save params", () => {
		expect(
			toDaedalusAttachmentSaveParams({
				sessionId: "session-1",
				filename: "diagram.png",
				mimeType: "image/png",
				dataBase64: "AAAA",
			}),
		).toEqual({ sessionId: "session-1", filename: "diagram.png", mimeType: "image/png", dataBase64: "AAAA" });
	});

	test("dispatches composer operations to Daedalus endpoints", async () => {
		const calls: Array<{ method: string; params: unknown }> = [];
		const client = {
			request(method: string, params: unknown) {
				calls.push({ method, params });
				if (method === "composer/file-search") return Promise.resolve({ files: [] });
				if (method === "composer/command-list") return Promise.resolve({ commands: [] });
				if (method === "composer/attachment/save") {
					return Promise.resolve({ attachment: { id: "att-1", kind: "image", filename: "diagram.png", size: 4 } });
				}
				throw new Error(method);
			},
		};
		const adapter = createDaedalusComposerAdapter(client as never);

		await adapter.fileSearch({ projectId: "project-1", query: "readme" });
		await adapter.commandList({ sessionId: "session-1" });
		await adapter.saveAttachment({ filename: "diagram.png", dataBase64: "AAAA" });

		expect(calls.map((call) => call.method)).toEqual([
			"composer/file-search",
			"composer/command-list",
			"composer/attachment/save",
		]);
		expect(calls[0]?.params).toEqual({ projectId: "project-1", query: "readme" });
		expect(calls[1]?.params).toEqual({ sessionId: "session-1" });
		expect(calls[2]?.params).toEqual({ filename: "diagram.png", dataBase64: "AAAA" });
	});
});
