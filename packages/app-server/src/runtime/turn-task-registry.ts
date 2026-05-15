export type TurnTaskStatus = "running" | "completed" | "failed" | "cancelled";

export interface TurnTaskRecord {
	readonly sessionId: string;
	readonly turnId: string;
	readonly promise: Promise<void>;
	status: TurnTaskStatus;
	error?: unknown;
}

export class TurnTaskRegistry {
	private readonly tasks = new Map<string, TurnTaskRecord>();

	start(input: {
		readonly sessionId: string;
		readonly turnId: string;
		readonly run: () => Promise<void>;
	}): TurnTaskRecord {
		const key = this.key(input.sessionId, input.turnId);
		if (this.tasks.has(key)) throw new Error(`Turn task already exists: ${input.turnId}`);
		const record: TurnTaskRecord = {
			sessionId: input.sessionId,
			turnId: input.turnId,
			status: "running",
			promise: Promise.resolve()
				.then(input.run)
				.then(() => {
					record.status = "completed";
				})
				.catch((error) => {
					record.status = "failed";
					record.error = error;
				}),
		};
		this.tasks.set(key, record);
		record.promise.finally(() => this.tasks.delete(key));
		return record;
	}

	get(sessionId: string, turnId: string): TurnTaskRecord | undefined {
		return this.tasks.get(this.key(sessionId, turnId));
	}

	delete(sessionId: string, turnId: string): boolean {
		const record = this.get(sessionId, turnId);
		if (record?.status === "running") record.status = "cancelled";
		return this.tasks.delete(this.key(sessionId, turnId));
	}

	private key(sessionId: string, turnId: string): string {
		return `${sessionId}:${turnId}`;
	}
}
