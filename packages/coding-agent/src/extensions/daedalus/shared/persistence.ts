import type { ExtensionContext } from "@daedalus-pi/coding-agent";

export function getLastToolResult<T>(ctx: ExtensionContext, toolName: string): T | undefined {
	const branch = ctx.sessionManager.getBranch();
	let lastDetails: T | undefined;
	for (const entry of branch) {
		if (entry.type !== "message") continue;
		const msg = entry.message;
		if (msg.role !== "toolResult" || msg.toolName !== toolName) continue;
		if (msg.details) {
			lastDetails = msg.details as T;
		}
	}
	return lastDetails;
}

export function getLastCustomEntry<T>(ctx: ExtensionContext, customType: string): T | undefined {
	const entries = ctx.sessionManager.getBranch();
	let lastData: T | undefined;
	for (const entry of entries) {
		if (entry.type === "custom" && entry.customType === customType) {
			lastData = entry.data as T;
		}
	}
	return lastData;
}

export function getAllToolResults<T>(ctx: ExtensionContext, toolName: string): T[] {
	const results: T[] = [];
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "message") continue;
		const msg = entry.message;
		if (msg.role !== "toolResult" || msg.toolName !== toolName) continue;
		if (msg.details) {
			results.push(msg.details as T);
		}
	}
	return results;
}
