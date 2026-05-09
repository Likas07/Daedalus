import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type ControlledSessionRuntime,
	type RuntimeControllerMessage,
	SessionController,
} from "../runtime/session-controller";
import { AttachmentService } from "./attachment-service";
import { CommandService } from "./command-service";
import { FileSearchService } from "./file-search-service";
import { PromptContextService } from "./prompt-context-service";

class FakeRuntime implements ControlledSessionRuntime {
	readonly session: ControlledSessionRuntime["session"];
	prompts: string[] = [];
	images = 0;
	constructor(readonly cwd: string) {
		this.session = {
			subscribe: () => () => {},
			prompt: async (prompt, options) => {
				this.prompts.push(prompt);
				this.images += options?.images?.length ?? 0;
			},
			abort: async () => {},
		};
	}
	async dispose(): Promise<void> {}
}

describe("GUI composer context services", () => {
	test("searches files while ignoring heavy directories", async () => {
		const dir = await mkdtemp(join(tmpdir(), "daedalus-composer-search-"));
		await mkdir(join(dir, "src"), { recursive: true });
		await mkdir(join(dir, "node_modules", "pkg"), { recursive: true });
		await writeFile(join(dir, "src", "agent.ts"), "export {};");
		await writeFile(join(dir, "node_modules", "pkg", "agent.ts"), "ignored");
		const files = await new FileSearchService().search({ cwd: dir, query: "agent", limit: 10 });
		expect(files.map((file) => file.path)).toEqual(["src/agent.ts"]);
		expect(files[0]).toEqual({ path: "src/agent.ts", label: "agent.ts", kind: "file", extension: "ts" });
	});

	test("stores valid image attachments and rejects invalid attachment types", async () => {
		const dir = await mkdtemp(join(tmpdir(), "daedalus-composer-attachments-"));
		const service = new AttachmentService(dir);
		const attachment = await service.save({
			filename: "screen.png",
			mimeType: "image/png",
			dataBase64: Buffer.from("png").toString("base64"),
		});
		expect(attachment).toMatchObject({ kind: "image", filename: "screen.png", mimeType: "image/png", size: 3 });
		await expect(service.get(attachment.id)).resolves.toMatchObject({
			id: attachment.id,
			kind: "image",
			filename: "screen.png",
		});
		await expect(
			service.save({ filename: "archive.zip", mimeType: "application/zip", dataBase64: "eA==" }),
		).rejects.toThrow("Unsupported attachment type");
	});

	test("returns slash command summaries", () => {
		const commands = new CommandService().list();
		expect(commands).toContainEqual(expect.objectContaining({ name: "plan", source: "built-in" }));
	});

	test("delivers file text context and image attachments to session prompts", async () => {
		const dir = await mkdtemp(join(tmpdir(), "daedalus-composer-context-"));
		await writeFile(join(dir, "note.txt"), "important context");
		const attachmentDir = join(dir, ".attachments");
		const attachments = new AttachmentService(attachmentDir);
		const image = await attachments.save({
			filename: "screen.png",
			mimeType: "image/png",
			dataBase64: Buffer.from("image-bytes").toString("base64"),
		});
		const messages: RuntimeControllerMessage[] = [];
		let runtime: FakeRuntime | undefined;
		const controller = new SessionController({
			agentDir: join(dir, ".agent"),
			eventSink: (message) => {
				messages.push(message);
			},
			makeSessionManager: () => ({}),
			nextSessionId: () => "session-1",
			nextTurnId: () => "turn-1",
			nextEventId: () => "event-1",
			promptContextResolver: new PromptContextService(attachments),
			runtimeFactory: async (input) => {
				runtime = new FakeRuntime(input.cwd);
				return runtime;
			},
		});
		await controller.startSession({ cwd: dir });
		await controller.startTurn({
			sessionId: "session-1",
			prompt: "use this",
			context: {
				filePaths: ["note.txt"],
				attachmentIds: [image.id],
				model: "m",
				effort: "high",
				accessMode: "supervised",
				projectId: "project-1",
				worktreeId: "worktree-1",
				draftState: { prompt: "use this" },
			},
		});
		for (let attempt = 0; attempt < 20 && !runtime?.prompts[0]; attempt++) await Bun.sleep(5);
		expect(runtime?.prompts[0]).toContain("<gui-context>");
		expect(runtime?.prompts[0]).toContain("projectId=project-1");
		expect(runtime?.prompts[0]).toContain("worktreeId=worktree-1");
		expect(runtime?.prompts[0]).toContain("draftState=");
		expect(runtime?.prompts[0]).toContain("File context: note.txt");
		expect(runtime?.prompts[0]).toContain("important context");
		expect(runtime?.images).toBe(1);
		expect(messages).toContainEqual(expect.objectContaining({ type: "turn/started" }));
	});
});
