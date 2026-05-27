import { lstatSync } from "node:fs";
import path from "node:path";
import { hasAllowedExtension } from "./allowed-extensions.js";

export { hasAllowedExtension };

export function isIgnoredByName(filePath: string): boolean {
	const name = path.basename(filePath);
	const lower = name.toLowerCase();
	return (
		lower.endsWith(".lock") ||
		lower.endsWith(".lockb") ||
		lower.endsWith("-lock.json") ||
		lower.endsWith("-lock.yaml") ||
		lower.endsWith("-lock.yml") ||
		lower.endsWith(".lock.json") ||
		lower.endsWith(".lockfile") ||
		name === "Package.resolved"
	);
}

export function isSymlink(filePath: string): boolean {
	try {
		return lstatSync(filePath).isSymbolicLink();
	} catch {
		return false;
	}
}

export function filterAndResolve(dirPath: string, paths: Iterable<string>): string[] {
	const resolved: string[] = [];
	for (const candidate of paths) {
		const absolutePath = path.isAbsolute(candidate) ? candidate : path.join(dirPath, candidate);
		if (isSymlink(absolutePath)) continue;
		if (isIgnoredByName(absolutePath)) continue;
		if (!hasAllowedExtension(absolutePath)) continue;
		resolved.push(path.resolve(absolutePath));
	}
	return resolved.sort((a, b) => a.localeCompare(b));
}
