import { StringEnum } from "@daedalus-pi/ai";
import { Text } from "@daedalus-pi/tui";
import { Type } from "@sinclair/typebox";
import type { ExtensionContext, ToolDefinition } from "../extensions/types.js";
import { loadSkillDocument, loadSkills, resolveSkillResource, type Skill } from "../skills.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";

export type SkillToolDetails =
	| { action: "load"; skillName: string; filePath: string }
	| { action: "resolve"; skillName: string; target: string; filePath: string };

export interface SkillToolOptions {
	cwd?: string;
	getSkills?: () => Skill[];
	ctxFactory?: () => ExtensionContext;
}

export const skillToolSchema = Type.Object({
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

function getVisibleSkills(ctx: ExtensionContext | undefined, options: SkillToolOptions | undefined): Skill[] {
	if (ctx) {
		return ctx.getSkills();
	}
	if (options?.getSkills) {
		return options.getSkills();
	}
	return loadSkills({ cwd: options?.cwd }).skills;
}

export function createSkillToolDefinition(
	options?: SkillToolOptions,
): ToolDefinition<typeof skillToolSchema, SkillToolDetails> {
	return {
		name: "skill",
		label: "Skill",
		description: "Load a skill or resolve a skill-relative reference. Actions: load, resolve",
		promptSnippet: "Load skills and resolve skill-relative references",
		promptGuidelines: ["Use the skill tool for skill loading instead of read, especially in SSH mode."],
		parameters: skillToolSchema,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const skill = getVisibleSkills(ctx, options).find((candidate) => candidate.name === params.name);
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
						{ type: "text", text: formatSkillBlock(skill.name, loaded.filePath, loaded.baseDir, loaded.body) },
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
	};
}

export function createSkillTool(options?: SkillToolOptions) {
	return wrapToolDefinition(createSkillToolDefinition(options), options?.ctxFactory);
}

export const skillToolDefinition = createSkillToolDefinition();
export const skillTool = createSkillTool();
