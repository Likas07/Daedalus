import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface PackagedRuntimeValidationInput {
	readonly appOutDir?: string;
	readonly packager?: { readonly info?: { readonly appInfo?: { readonly productFilename?: string } } };
}

function resourcesCandidates(appOutDir?: string): string[] {
	const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
	const candidates = [join(desktopRoot, "resources")];
	if (appOutDir) {
		candidates.push(join(appOutDir, "resources"));
		candidates.push(join(appOutDir, "Daedalus.app", "Contents", "Resources"));
	}
	return candidates;
}

function validateResources(resourcesDir: string): string | undefined {
	const guiIndex = join(resourcesDir, "gui", "dist", "index.html");
	const appServerDir = join(resourcesDir, "app-server");
	const binary = join(appServerDir, process.platform === "win32" ? "daedalus-app-server.exe" : "daedalus-app-server");
	const fallback = join(appServerDir, "main.ts");
	if (!existsSync(guiIndex)) return `Missing packaged GUI asset: ${guiIndex}`;
	if (!existsSync(binary) && !existsSync(fallback)) return `Missing packaged app-server runtime: ${binary} or ${fallback}`;
	return undefined;
}

export async function validatePackagedRuntime(input: PackagedRuntimeValidationInput = {}): Promise<void> {
	const candidates = resourcesCandidates(input.appOutDir);
	const errors = candidates.map(validateResources).filter((error): error is string => Boolean(error));
	if (errors.length === candidates.length) throw new Error(errors.join("\n"));
}

if (import.meta.main) await validatePackagedRuntime({ appOutDir: process.argv[2] });

export default async function afterPack(context: PackagedRuntimeValidationInput = {}): Promise<void> {
	await validatePackagedRuntime(context);
}
