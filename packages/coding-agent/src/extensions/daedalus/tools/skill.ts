import { StringEnum } from "@daedalus-pi/ai";
import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { Text } from "@daedalus-pi/tui";
import { Type } from "@sinclair/typebox";
import { loadSkillDocument, resolveSkillResource } from "../../../core/skills.js";

type SkillToolDetails =
	| { action: "load"; skillName: string; filePath: string }
	| { action: "resolve"; skillName: string; target: string; filePath: string };

const SkillParams = Type.Object({
	action: StringEnum(["load", "resolve"] as const),
	name: Type.String({ description: "Skill name to load" }),
	target: Type.Optional(Type.String({ description: "Skill-relative file to resolve" })),
});

function formatSkillBlock(name: string, location: string, baseDir: string, body: string): string {
	return `<skill name="${name}" location="${location}">\nReferences are relative to ${baseDir}.\n\n${body}\n</skill>`;
}

function formatResolvedBlock(name: string, target: string, location: string, content: string): string {
	return `<skill-resource name="${name}" target="${target}" location="${location}">\n${content}\n</skill-resource>`;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "skill",
		label: "Skill",
		description: "Load a skill or resolve a skill-relative reference. Actions: load, resolve",
		promptSnippet: "Load skills and resolve skill-relative references",
		promptGuidelines: ["Use the skill tool for skill loading instead of read, especially in SSH mode."],
		parameters: SkillParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const skill = ctx.getSkills().find((candidate) => candidate.name === params.name);
			if (!skill) {
				return {
					content: [{ type: "text", text: `Skill not found: ${params.name}` }],
					details: { action: params.action, skillName: params.name, filePath: "" } as SkillToolDetails,
				};
			}

			if (params.action === "load") {
				const loaded = loadSkillDocument(skill);
				return {
					content: [
						{
							type: "text",
							text: formatSkillBlock(skill.name, loaded.filePath, loaded.baseDir, loaded.body),
						},
					],
					details: { action: "load", skillName: skill.name, filePath: loaded.filePath } as SkillToolDetails,
				};
			}

			if (!params.target) {
				return {
					content: [{ type: "text", text: "target is required for resolve" }],
					details: {
						action: "resolve",
						skillName: skill.name,
						target: "",
						filePath: skill.filePath,
					} as SkillToolDetails,
				};
			}

			const resolved = resolveSkillResource(skill, params.target);
			return {
				content: [
					{
						type: "text",
						text: formatResolvedBlock(skill.name, params.target, resolved.filePath, resolved.content),
					},
				],
				details: {
					action: "resolve",
					skillName: skill.name,
					target: params.target,
					filePath: resolved.filePath,
				} as SkillToolDetails,
			};
		},

		renderCall(args, theme) {
			const suffix = args.action === "resolve" && args.target ? ` ${args.target}` : "";
			return new Text(
				theme.fg("toolTitle", theme.bold("skill ")) + theme.fg("muted", `${args.action} ${args.name}${suffix}`),
				0,
				0,
			);
		},
	});
}
