export class PerChatSequencer {
	private readonly tails = new Map<number, Promise<void>>();

	enqueue<T>(chatId: number, work: () => Promise<T>): Promise<T> {
		const previous = this.tails.get(chatId) ?? Promise.resolve();
		const run = previous.catch(() => undefined).then(work);
		const tail = run
			.catch(() => undefined)
			.then(() => undefined)
			.finally(() => {
				if (this.tails.get(chatId) === tail) {
					this.tails.delete(chatId);
				}
			});

		this.tails.set(chatId, tail);
		return run;
	}

	getPendingChatCount(): number {
		return this.tails.size;
	}
}
