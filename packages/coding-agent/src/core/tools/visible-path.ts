import { basename, isAbsolute, relative, resolve } from "node:path";

function isVisibleRelativePath(path: string): boolean {
	return path.length > 0 && !path.startsWith("..") && !path.includes("../") && !path.includes("..\\");
}

export function formatVisiblePath(path: string, roots: readonly (string | undefined)[] = []): string {
	if (!path) return path;
	if (!isAbsolute(path)) return path;
	for (const root of roots) {
		if (!root) continue;
		const relativePath = relative(resolve(root), path);
		if (isVisibleRelativePath(relativePath)) return relativePath;
	}
	return basename(path);
}
