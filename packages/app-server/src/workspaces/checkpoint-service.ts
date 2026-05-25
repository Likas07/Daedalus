import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AppServerDatabase, appendEvent, type EventPayload } from "..";
import { projectRuntimeEvents } from "../persistence/projector";
import type { RuntimeEventLog } from "../persistence/runtime-event-log";
import { git, sanitizeRefPart } from "./git";

export interface CheckpointServiceOptions {
	readonly database: AppServerDatabase;
	readonly eventLog?: RuntimeEventLog;
}

export interface CreateCheckpointInput {
	readonly cwd: string;
	readonly sessionId: string;
	readonly turnId: string;
	readonly label?: string;
}

export interface CheckpointRecord {
	readonly checkpointId: string;
	readonly ref: string;
	readonly commit: string;
}

export class CheckpointService {
	constructor(private readonly options: CheckpointServiceOptions) {}

	async create(input: CreateCheckpointInput): Promise<CheckpointRecord> {
		const session = sanitizeRefPart(input.sessionId);
		const turn = sanitizeRefPart(input.turnId);
		const ref = `refs/daedalus/checkpoints/${session}/${turn}`;
		const indexFile = join(tmpdir(), `daedalus-checkpoint-${crypto.randomUUID()}.index`);
		await git(input.cwd, ["read-tree", "HEAD"], { env: { GIT_INDEX_FILE: indexFile } });
		await git(input.cwd, ["add", "-A"], { env: { GIT_INDEX_FILE: indexFile } });
		const tree = (await git(input.cwd, ["write-tree"], { env: { GIT_INDEX_FILE: indexFile } })).stdout.trim();
		const parent = (await git(input.cwd, ["rev-parse", "HEAD"])).stdout.trim();
		const message = input.label ?? `Daedalus checkpoint ${input.sessionId}/${input.turnId}`;
		const commit = (await git(input.cwd, ["commit-tree", tree, "-p", parent, "-m", message])).stdout.trim();
		await git(input.cwd, ["update-ref", ref, commit]);
		await Bun.file(indexFile)
			.delete()
			.catch(() => undefined);
		const checkpointId = `${input.sessionId}:${input.turnId}`;
		this.appendRuntimeEvent({
			streamId: `session:${input.sessionId}`,
			type: "checkpoint/created",
			payload: {
				checkpointId,
				sessionId: input.sessionId,
				turnId: input.turnId,
				ref,
				commit,
				label: input.label ?? null,
				metadata: {},
			} satisfies EventPayload,
		});
		return { checkpointId, ref, commit };
	}

	async restore(input: { readonly cwd: string; readonly checkpointRef: string }): Promise<void> {
		await git(input.cwd, ["restore", "--source", input.checkpointRef, "--worktree", "--staged", "--", "."]);
	}

	private appendRuntimeEvent(input: Parameters<typeof appendEvent>[1]): void {
		if (this.options.eventLog) {
			this.options.eventLog.append(input);
			return;
		}
		appendEvent(this.options.database, input);
		projectRuntimeEvents(this.options.database);
	}
}
