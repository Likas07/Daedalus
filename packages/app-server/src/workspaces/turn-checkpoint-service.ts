import type { AppEvent } from "@daedalus-pi/app-server-protocol";
import type { CheckpointRecord, CheckpointService } from "./checkpoint-service";
import { DiffService } from "./diff-service";

export interface TurnCheckpointServiceOptions {
	readonly checkpointService: Pick<CheckpointService, "create">;
	readonly diffService?: DiffService;
	readonly publish?: (event: AppEvent) => void | Promise<void>;
	readonly nextEventId?: () => string;
	readonly now?: () => Date;
}

export interface CaptureTurnCheckpointInput {
	readonly cwd: string;
	readonly sessionId: string;
	readonly turnId: string;
	readonly workspaceTargetId?: string;
	readonly label?: string;
}

export class TurnCheckpointService {
	private readonly diffService: DiffService;

	constructor(private readonly options: TurnCheckpointServiceOptions) {
		this.diffService = options.diffService ?? new DiffService();
	}

	captureBeforeTurn(input: CaptureTurnCheckpointInput): Promise<CheckpointRecord> {
		return this.options.checkpointService.create({
			cwd: input.cwd,
			sessionId: input.sessionId,
			turnId: input.turnId,
			label: input.label ?? `Before turn ${input.turnId}`,
		});
	}

	async publishTurnDiff(input: CaptureTurnCheckpointInput & { readonly checkpoint: CheckpointRecord }): Promise<void> {
		if (!input.workspaceTargetId || !this.options.publish) return;
		const params = {
			workspaceTargetId: input.workspaceTargetId,
			threadId: input.sessionId,
			turnId: input.turnId,
			checkpointId: input.checkpoint.checkpointId,
		};
		const result = await this.diffService.getSummaryV1(input.cwd, params, input.checkpoint.ref);
		if (!result.ok) return;
		await this.options.publish({
			id: this.options.nextEventId?.() ?? `event-${crypto.randomUUID()}`,
			type: "diff/summary",
			ts: (this.options.now?.() ?? new Date()).toISOString(),
			sessionId: input.sessionId,
			payload: {
				threadId: input.sessionId,
				turnId: input.turnId,
				workspaceTargetId: input.workspaceTargetId,
				checkpointId: input.checkpoint.checkpointId,
				diff: {
					kind: "diff-summary",
					diffId: result.summary.diffId,
					workspaceTargetId: input.workspaceTargetId,
					threadId: input.sessionId,
					turnId: input.turnId,
					checkpointId: input.checkpoint.checkpointId,
				},
				status: result.summary.status,
			},
		} as AppEvent);
	}
}
