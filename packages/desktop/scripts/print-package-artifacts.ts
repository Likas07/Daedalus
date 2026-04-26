import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const releaseDir = resolve(import.meta.dir, "../../..", "release", "desktop");

function executableName(): string {
	if (process.platform === "win32") return "Daedalus.exe";
	if (process.platform === "darwin") return "Daedalus.app";
	return "daedalus";
}

async function findArtifacts(): Promise<string[]> {
	if (!existsSync(releaseDir)) return [];
	const entries = await readdir(releaseDir, { withFileTypes: true });
	const artifacts: string[] = [];

	for (const entry of entries) {
		const path = join(releaseDir, entry.name);
		if (entry.isFile() && /\.(AppImage|dmg|exe|msi|deb|rpm|zip)$/i.test(entry.name)) artifacts.push(path);
		if (entry.isDirectory() && entry.name.endsWith("-unpacked")) {
			const executable = join(path, executableName());
			if (existsSync(executable)) artifacts.push(executable);
		}
	}

	return artifacts.sort();
}

const artifacts = await findArtifacts();
if (artifacts.length === 0) {
	console.warn(`No desktop artifacts found in ${releaseDir}`);
	process.exit(1);
}

console.log("\nDesktop app artifacts ready:");
for (const artifact of artifacts) console.log(`- ${artifact}`);
