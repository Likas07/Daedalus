import { describe, expect, test } from "vitest";
import { buildSystemPrompt } from "../src/core/system-prompt.js";

describe("buildSystemPrompt", () => {
	describe("empty tools", () => {
		test("shows (none) for empty tools list", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("Available tools:\n(none)");
		});

		test("shows file paths guideline even with no tools", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("Show file paths clearly");
		});
	});

	describe("default tools", () => {
		test("includes current default coding tools when snippets are provided", () => {
			const prompt = buildSystemPrompt({
				toolSnippets: {
					read: "Read file contents",
					bash: "Execute bash commands",
					hashline_edit: "Apply stale-safe hashline edits",
					write: "Create or overwrite files",
					grep: "Search file contents",
					find: "Find files",
					ls: "List directory contents",
				},
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("- read:");
			expect(prompt).toContain("- bash:");
			expect(prompt).toContain("- hashline_edit:");
			expect(prompt).toContain("- write:");
			expect(prompt).toContain("- grep:");
			expect(prompt).toContain("- find:");
			expect(prompt).toContain("- ls:");
		});
	});

	describe("custom tool snippets", () => {
		test("includes custom tools in available tools section when promptSnippet is provided", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				toolSnippets: {
					dynamic_tool: "Run dynamic test behavior",
				},
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("- dynamic_tool: Run dynamic test behavior");
		});

		test("omits custom tools from available tools section when promptSnippet is not provided", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				contextFiles: [],
				skills: [],
			});

			expect(prompt).not.toContain("dynamic_tool");
		});
	});

	describe("skills", () => {
		test("includes skills when skill tool is active even without read", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["skill"],
				toolSnippets: { skill: "Load skills and resolve skill-relative references" },
				skills: [
					{
						name: "test-skill",
						description: "A test skill.",
						filePath: "/tmp/test-skill/SKILL.md",
						baseDir: "/tmp/test-skill",
						sourceInfo: {} as any,
						disableModelInvocation: false,
					},
				],
				contextFiles: [],
			});

			expect(prompt).toContain("<available_skills>");
			expect(prompt).toContain("Use the skill tool to load a skill");
		});
	});

	describe("prompt guidelines", () => {
		test("appends promptGuidelines to default guidelines", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				promptGuidelines: ["Use dynamic_tool for project summaries."],
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("- Use dynamic_tool for project summaries.");
		});

		test("deduplicates and trims promptGuidelines", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				promptGuidelines: ["Use dynamic_tool for summaries.", "  Use dynamic_tool for summaries.  ", "   "],
				contextFiles: [],
				skills: [],
			});

			expect(prompt.match(/- Use dynamic_tool for summaries\./g)).toHaveLength(1);
		});
	});

	describe("Daedalus prompt layering", () => {
		test("composes constitutional prompt before Daedalus persona layer", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
			});

			const constitutionIndex = prompt.indexOf("# Daedalus Constitution");
			const personaIndex = prompt.indexOf("# Daedalus Persona");

			expect(constitutionIndex).toBeGreaterThanOrEqual(0);
			expect(personaIndex).toBeGreaterThan(constitutionIndex);
		});

		test("describes Daedalus as a master artisan in the persona layer", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("master artisan");
			expect(prompt).toContain("The primary assistant is Daedalus");
		});
	});
});
