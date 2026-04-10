import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@daedalus-pi/coding-agent";

const baseDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(baseDir, "..", "..");

export default function (pi: ExtensionAPI) {
	pi.on("resources_discover", () => {
		const skillsDir = join(packageRoot, "skills");
		const promptsDir = join(packageRoot, "prompts");
		const themesDir = join(packageRoot, "themes");

		return {
			skillPaths: existsSync(skillsDir) ? [skillsDir] : [],
			promptPaths: existsSync(promptsDir) ? [promptsDir] : [],
			themePaths: existsSync(themesDir) ? [themesDir] : [],
		};
	});
}
