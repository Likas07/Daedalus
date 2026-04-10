import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function resolvePackagePath(importMetaUrl: string, ...segments: string[]): string {
	const baseDir = dirname(fileURLToPath(importMetaUrl));
	const packageRoot = join(baseDir, "..", "..");
	return join(packageRoot, ...segments);
}
