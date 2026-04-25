import type { ServerNotification } from "@daedalus-pi/app-server-protocol";
import type { AppServerClient } from "./client";

export interface Subscription {
	unsubscribe(): void;
}

export class SubscriptionSet implements Subscription {
	private readonly unsubscribers = new Set<() => void>();

	add(unsubscribe: (() => void) | Subscription): Subscription {
		const fn = typeof unsubscribe === "function" ? unsubscribe : () => unsubscribe.unsubscribe();
		this.unsubscribers.add(fn);
		return { unsubscribe: () => this.remove(fn) };
	}

	remove(unsubscribe: () => void): void {
		if (!this.unsubscribers.delete(unsubscribe)) return;
		unsubscribe();
	}

	unsubscribe(): void {
		for (const unsubscribe of [...this.unsubscribers]) unsubscribe();
		this.unsubscribers.clear();
	}
}

export function subscribeToEvents(
	client: AppServerClient,
	listener: (event: unknown, notification: Extract<ServerNotification, { method: "event/appended" }>) => void,
): Subscription {
	const unsubscribe = client.onNotification("event/appended", (params, notification) =>
		listener(params.event, notification),
	);
	return { unsubscribe };
}
