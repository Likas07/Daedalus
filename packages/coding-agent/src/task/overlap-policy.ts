import { normalizeRelativePath, scopeMatchesPath } from "../tools/task-scope-guard";
import type { TaskItem } from "./types";

export type TaskOverlapPolicy = "allow" | "warn" | "deny";

export interface TaskOwnershipOverlap {
	leftTaskId: string;
	rightTaskId: string;
	leftScope: string;
	rightScope: string;
}

function getLiteralPrefix(scope: string): string {
	const normalized = normalizeRelativePath(scope);
	const wildcardIndex = Array.from(normalized).findIndex(
		character => character === "*" || character === "?" || character === "[",
	);
	if (wildcardIndex < 0) return normalized;
	return normalized.slice(0, wildcardIndex).replace(/\/$/, "");
}

function scopesOverlap(leftScope: string, rightScope: string): boolean {
	const normalizedLeft = normalizeRelativePath(leftScope);
	const normalizedRight = normalizeRelativePath(rightScope);
	if (normalizedLeft === normalizedRight) {
		return true;
	}
	if (scopeMatchesPath(normalizedLeft, normalizedRight) || scopeMatchesPath(normalizedRight, normalizedLeft)) {
		return true;
	}
	const leftPrefix = getLiteralPrefix(normalizedLeft);
	const rightPrefix = getLiteralPrefix(normalizedRight);
	if (!leftPrefix || !rightPrefix) {
		return true;
	}
	return (
		leftPrefix === rightPrefix || leftPrefix.startsWith(`${rightPrefix}/`) || rightPrefix.startsWith(`${leftPrefix}/`)
	);
}

export function detectTaskOwnershipOverlaps(tasks: TaskItem[]): TaskOwnershipOverlap[] {
	const overlaps: TaskOwnershipOverlap[] = [];
	for (let leftIndex = 0; leftIndex < tasks.length; leftIndex++) {
		const leftTask = tasks[leftIndex];
		const leftScopes = leftTask.ownedPaths?.filter(Boolean) ?? [];
		if (leftScopes.length === 0) continue;
		for (let rightIndex = leftIndex + 1; rightIndex < tasks.length; rightIndex++) {
			const rightTask = tasks[rightIndex];
			const rightScopes = rightTask.ownedPaths?.filter(Boolean) ?? [];
			if (rightScopes.length === 0) continue;
			for (const leftScope of leftScopes) {
				for (const rightScope of rightScopes) {
					if (!scopesOverlap(leftScope, rightScope)) continue;
					overlaps.push({
						leftTaskId: leftTask.id,
						rightTaskId: rightTask.id,
						leftScope,
						rightScope,
					});
				}
			}
		}
	}
	return overlaps;
}

export function formatTaskOwnershipOverlapMessage(overlaps: TaskOwnershipOverlap[]): string {
	const lines = overlaps.map(
		overlap =>
			`- ${overlap.leftTaskId} (${overlap.leftScope}) overlaps ${overlap.rightTaskId} (${overlap.rightScope})`,
	);
	return `Delegated task ownership overlaps detected:\n${lines.join("\n")}`;
}
