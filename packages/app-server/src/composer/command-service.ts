export interface ComposerCommandSummary {
	readonly name: string;
	readonly label: string;
	readonly description?: string;
	readonly source: "extension" | "prompt-template" | "skill" | "built-in";
	readonly disabled?: boolean;
	readonly disabledReason?: string;
	readonly sourcePath?: string;
}

const BUILT_INS = [
	"settings",
	"model",
	"scoped-models",
	"export",
	"import",
	"share",
	"copy",
	"name",
	"session",
	"changelog",
	"hotkeys",
	"fork",
	"tree",
	"login",
	"logout",
	"new",
	"compact",
	"resume",
	"reload",
	"quit",
];

export class CommandService {
	list(): ComposerCommandSummary[] {
		return [
			...BUILT_INS.map((name) => ({
				name,
				label: name.replace(/-/g, " "),
				description: `Run ${name}`,
				source: "built-in" as const,
			})),
			{ name: "plan", label: "Plan", description: "Create an implementation plan", source: "built-in" },
			{ name: "default", label: "Default", description: "Use the default agent mode", source: "built-in" },
			{ name: "help", label: "Help", description: "Show available agent commands", source: "built-in" },
		];
	}
}
