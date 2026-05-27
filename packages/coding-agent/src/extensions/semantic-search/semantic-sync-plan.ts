import type { SemanticIndexedFile, SemanticLocalFileState, SemanticSyncPlan } from "./semantic-types.js";

export function buildSemanticSyncPlan(
	localFiles: SemanticLocalFileState[],
	indexedFiles: SemanticIndexedFile[],
	failedFiles: Array<{ filePath: string; reason: string }> = [],
): SemanticSyncPlan {
	const localByPath = new Map(localFiles.map((file) => [file.filePath, file]));
	const indexedByPath = new Map(indexedFiles.map((file) => [file.filePath, file]));
	const allPaths = new Set<string>([...localByPath.keys(), ...indexedByPath.keys()]);
	const newFiles: string[] = [];
	const modifiedFiles: string[] = [];
	const deletedFiles: string[] = [];
	const unchangedFiles: string[] = [];

	for (const filePath of [...allPaths].sort((a, b) => a.localeCompare(b))) {
		const local = localByPath.get(filePath);
		const indexed = indexedByPath.get(filePath);
		if (local && indexed) {
			if (
				local.fileHash === indexed.fileHash &&
				local.fileSize === indexed.fileSize &&
				Math.trunc(local.modifiedMs) === Math.trunc(indexed.modifiedMs)
			) {
				unchangedFiles.push(filePath);
			} else {
				modifiedFiles.push(filePath);
			}
		} else if (local) {
			newFiles.push(filePath);
		} else if (indexed) {
			deletedFiles.push(filePath);
		}
	}

	return {
		newFiles,
		modifiedFiles,
		deletedFiles,
		unchangedFiles,
		failedFiles: [...failedFiles].sort((a, b) => a.filePath.localeCompare(b.filePath)),
	};
}
