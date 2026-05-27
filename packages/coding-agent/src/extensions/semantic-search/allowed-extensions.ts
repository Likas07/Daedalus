import path from "node:path";
import extensionsText from "./allowed_extensions.txt";

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
