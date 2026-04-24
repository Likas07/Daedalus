import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionsText = readFileSync(path.join(dirname, "allowed_extensions.txt"), "utf8");

export const ALLOWED_EXTENSIONS = new Set(
	extensionsText
		.split(/\r?\n/)
		.map((line) => line.trim().toLowerCase())
		.filter(Boolean),
);

export function hasAllowedExtension(filePath: string): boolean {
	const ext = path.extname(filePath).slice(1).toLowerCase();
	return ext.length > 0 && ALLOWED_EXTENSIONS.has(ext);
}
