import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";
import { CONFIG_DIR_NAME } from "../src/config.js";
import type { ResourceDiagnostic } from "../src/core/diagnostics.js";
import type { PathMetadata } from "../src/core/package-manager.js";
import {
	formatSkillsForPrompt,
	loadSkillDocument,
	loadSkills,
	loadSkillsFromDir,
	resolveSkillResource,
	type Skill,
} from "../src/core/skills.js";
import { createSyntheticSourceInfo } from "../src/core/source-info.js";

const fixturesDir = resolve(__dirname, "fixtures/skills");
const collisionFixturesDir = resolve(__dirname, "fixtures/skills-collision");

function createTestSkill(options: {
	name: string;
	description: string;
	filePath: string;
	baseDir: string;
	disableModelInvocation?: boolean;
	source?: string;
}): Skill {
	return {
		name: options.name,
		description: options.description,
		filePath: options.filePath,
		baseDir: options.baseDir,
		sourceInfo: createSyntheticSourceInfo(options.filePath, { source: options.source ?? "test" }),
		disableModelInvocation: options.disableModelInvocation ?? false,
	};
}

describe("skills", () => {
	describe("loadSkillsFromDir", () => {
		it("should load a valid skill", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "valid-skill"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe("valid-skill");
			expect(skills[0].description).toBe("A valid skill for testing purposes.");
			expect(skills[0].sourceInfo.source).toBe("test");
			expect(diagnostics).toHaveLength(0);
		});

		it("should warn when name doesn't match parent directory", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "name-mismatch"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe("different-name");
			expect(
				diagnostics.some((d: ResourceDiagnostic) => d.message.includes("does not match parent directory")),
			).toBe(true);
		});

		it("should warn when name contains invalid characters", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "invalid-name-chars"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(diagnostics.some((d: ResourceDiagnostic) => d.message.includes("invalid characters"))).toBe(true);
		});

		it("should warn when name exceeds 64 characters", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "long-name"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(diagnostics.some((d: ResourceDiagnostic) => d.message.includes("exceeds 64 characters"))).toBe(true);
		});

		it("should warn and skip skill when description is missing", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "missing-description"),
				source: "test",
			});

			expect(skills).toHaveLength(0);
			expect(diagnostics.some((d: ResourceDiagnostic) => d.message.includes("description is required"))).toBe(true);
		});

		it("should ignore unknown frontmatter fields", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "unknown-field"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(diagnostics).toHaveLength(0);
		});

		it("should load nested skills recursively", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "nested"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe("child-skill");
			expect(diagnostics).toHaveLength(0);
		});

		it("should prefer a directory's root SKILL.md over nested SKILL.md files", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "root-skill-preferred"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe("root-skill-preferred");
			expect(skills[0].description).toBe("Root skill should win.");
			expect(diagnostics).toHaveLength(0);
		});

		it("should skip files without frontmatter", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "no-frontmatter"),
				source: "test",
			});

			// no-frontmatter has no description, so it should be skipped
			expect(skills).toHaveLength(0);
			expect(diagnostics.some((d: ResourceDiagnostic) => d.message.includes("description is required"))).toBe(true);
		});

		it("should warn and skip skill when YAML frontmatter is invalid", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "invalid-yaml"),
				source: "test",
			});

			expect(skills).toHaveLength(0);
			expect(diagnostics.some((d: ResourceDiagnostic) => d.message.includes("at line"))).toBe(true);
		});

		it("should preserve multiline descriptions from YAML", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "multiline-description"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].description).toContain("\n");
			expect(skills[0].description).toContain("This is a multiline description.");
			expect(diagnostics).toHaveLength(0);
		});

		it("should warn when name contains consecutive hyphens", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "consecutive-hyphens"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(diagnostics.some((d: ResourceDiagnostic) => d.message.includes("consecutive hyphens"))).toBe(true);
		});

		it("should load all skills from fixture directory", () => {
			const { skills } = loadSkillsFromDir({
				dir: fixturesDir,
				source: "test",
			});

			// Should load all skills that have descriptions (even with warnings)
			// valid-skill, name-mismatch, invalid-name-chars, long-name, unknown-field, nested/child-skill, consecutive-hyphens
			// NOT: missing-description, no-frontmatter (both missing descriptions)
			expect(skills.length).toBeGreaterThanOrEqual(6);
		});

		it("should return empty for non-existent directory", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: "/non/existent/path",
				source: "test",
			});

			expect(skills).toHaveLength(0);
			expect(diagnostics).toHaveLength(0);
		});

		it("should use parent directory name when name not in frontmatter", () => {
			// The no-frontmatter fixture has no name in frontmatter, so it should use "no-frontmatter"
			// But it also has no description, so it won't load
			// Let's test with a valid skill that relies on directory name
			const { skills } = loadSkillsFromDir({
				dir: join(fixturesDir, "valid-skill"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe("valid-skill");
		});

		it("should parse disable-model-invocation frontmatter field", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "disable-model-invocation"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe("disable-model-invocation");
			expect(skills[0].disableModelInvocation).toBe(true);
			// Should not warn about unknown field
			expect(diagnostics.some((d: ResourceDiagnostic) => d.message.includes("unknown frontmatter field"))).toBe(
				false,
			);
		});

		it("should default disableModelInvocation to false when not specified", () => {
			const { skills } = loadSkillsFromDir({
				dir: join(fixturesDir, "valid-skill"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].disableModelInvocation).toBe(false);
		});
	});

	describe("skill document helpers", () => {
		it("loads a skill document body without frontmatter", () => {
			const skill = createTestSkill({
				name: "test-skill",
				description: "A test skill.",
				filePath: join(fixturesDir, "valid-skill", "SKILL.md"),
				baseDir: join(fixturesDir, "valid-skill"),
			});

			const loaded = loadSkillDocument(skill);

			expect(loaded.body).toContain("# Valid Skill");
			expect(loaded.body).not.toContain("name:");
		});

		it("resolves a relative resource within the skill directory", () => {
			const skill = createTestSkill({
				name: "test-skill",
				description: "A test skill.",
				filePath: join(fixturesDir, "valid-skill", "SKILL.md"),
				baseDir: join(fixturesDir, "valid-skill"),
			});

			const resolved = resolveSkillResource(skill, "reference.md");

			expect(resolved.filePath).toContain("reference.md");
			expect(resolved.content).toContain("Reference");
		});

		it("rejects path traversal in resolveSkillResource", () => {
			const skill = createTestSkill({
				name: "test-skill",
				description: "A test skill.",
				filePath: join(fixturesDir, "valid-skill", "SKILL.md"),
				baseDir: join(fixturesDir, "valid-skill"),
			});

			expect(() => resolveSkillResource(skill, "../daedalus/shared/outside.md")).toThrow("escapes skill directory");
		});
	});

	describe("formatSkillsForPrompt", () => {
		it("should return empty string for no skills", () => {
			const result = formatSkillsForPrompt([]);
			expect(result).toBe("");
		});

		it("should format skills as XML", () => {
			const skills: Skill[] = [
				createTestSkill({
					name: "test-skill",
					description: "A test skill.",
					filePath: "/path/to/skill/SKILL.md",
					baseDir: "/path/to/skill",
				}),
			];

			const result = formatSkillsForPrompt(skills);

			expect(result).toContain("<available_skills>");
			expect(result).toContain("</available_skills>");
			expect(result).toContain("<skill>");
			expect(result).toContain("<name>test-skill</name>");
			expect(result).toContain("<description>A test skill.</description>");
			expect(result).toContain("<location>/path/to/skill/SKILL.md</location>");
		});

		it("should include intro text before XML", () => {
			const skills: Skill[] = [
				createTestSkill({
					name: "test-skill",
					description: "A test skill.",
					filePath: "/path/to/skill/SKILL.md",
					baseDir: "/path/to/skill",
				}),
			];

			const result = formatSkillsForPrompt(skills);
			const xmlStart = result.indexOf("<available_skills>");
			const introText = result.substring(0, xmlStart);

			expect(introText).toContain("The following skills provide specialized instructions");
			expect(introText).toContain("Use the read tool to load a skill's file");
		});

		it("should escape XML special characters", () => {
			const skills: Skill[] = [
				createTestSkill({
					name: "test-skill",
					description: 'A skill with <special> & "characters".',
					filePath: "/path/to/skill/SKILL.md",
					baseDir: "/path/to/skill",
				}),
			];

			const result = formatSkillsForPrompt(skills);

			expect(result).toContain("&lt;special&gt;");
			expect(result).toContain("&amp;");
			expect(result).toContain("&quot;characters&quot;");
		});

		it("should format multiple skills", () => {
			const skills: Skill[] = [
				createTestSkill({
					name: "skill-one",
					description: "First skill.",
					filePath: "/path/one/SKILL.md",
					baseDir: "/path/one",
				}),
				createTestSkill({
					name: "skill-two",
					description: "Second skill.",
					filePath: "/path/two/SKILL.md",
					baseDir: "/path/two",
				}),
			];

			const result = formatSkillsForPrompt(skills);

			expect(result).toContain("<name>skill-one</name>");
			expect(result).toContain("<name>skill-two</name>");
			expect((result.match(/<skill>/g) || []).length).toBe(2);
		});

		it("should exclude skills with disableModelInvocation from prompt", () => {
			const skills: Skill[] = [
				createTestSkill({
					name: "visible-skill",
					description: "A visible skill.",
					filePath: "/path/visible/SKILL.md",
					baseDir: "/path/visible",
				}),
				createTestSkill({
					name: "hidden-skill",
					description: "A hidden skill.",
					filePath: "/path/hidden/SKILL.md",
					baseDir: "/path/hidden",
					disableModelInvocation: true,
				}),
			];

			const result = formatSkillsForPrompt(skills);

			expect(result).toContain("<name>visible-skill</name>");
			expect(result).not.toContain("<name>hidden-skill</name>");
			expect((result.match(/<skill>/g) || []).length).toBe(1);
		});

		it("should return empty string when all skills have disableModelInvocation", () => {
			const skills: Skill[] = [
				createTestSkill({
					name: "hidden-skill",
					description: "A hidden skill.",
					filePath: "/path/hidden/SKILL.md",
					baseDir: "/path/hidden",
					disableModelInvocation: true,
				}),
			];

			const result = formatSkillsForPrompt(skills);
			expect(result).toBe("");
		});

		it("uses skill-tool wording when requested", () => {
			const result = formatSkillsForPrompt(
				[
					createTestSkill({
						name: "test-skill",
						description: "A test skill.",
						filePath: "/path/to/skill/SKILL.md",
						baseDir: "/path/to/skill",
					}),
				],
				{ loader: "skill" },
			);

			expect(result).toContain("Use the skill tool to load a skill");
			expect(result).toContain("skill tool's resolve action");
		});
	});

	describe("loadSkills with options", () => {
		const emptyAgentDir = resolve(__dirname, "fixtures/empty-agent");
		const emptyCwd = resolve(__dirname, "fixtures/empty-cwd");

		it("should load from explicit skillPaths", () => {
			const { skills, diagnostics } = loadSkills({
				agentDir: emptyAgentDir,
				cwd: emptyCwd,
				skillPaths: [join(fixturesDir, "valid-skill")],
			});
			expect(skills).toHaveLength(1);
			expect(skills[0].sourceInfo.scope).toBe("temporary");
			expect(diagnostics).toHaveLength(0);
		});

		it("prefers project skills over user skills over explicit paths", () => {
			const tempDir = mkdtempSync(join(tmpdir(), "daedalus-skill-precedence-"));
			try {
				const agentDir = join(tempDir, "agent");
				const cwd = join(tempDir, "project");
				const projectSkillDir = join(cwd, CONFIG_DIR_NAME, "skills", "planning");
				const userSkillDir = join(agentDir, "skills", "planning");
				const extensionSkillDir = join(tempDir, "extension-skills", "planning");
				mkdirSync(projectSkillDir, { recursive: true });
				mkdirSync(userSkillDir, { recursive: true });
				mkdirSync(extensionSkillDir, { recursive: true });

				writeFileSync(join(projectSkillDir, "SKILL.md"), "---\nname: planning\ndescription: project\n---\nProject");
				writeFileSync(join(userSkillDir, "SKILL.md"), "---\nname: planning\ndescription: user\n---\nUser");
				writeFileSync(
					join(extensionSkillDir, "SKILL.md"),
					"---\nname: planning\ndescription: extension\n---\nExtension",
				);

				const { skills, diagnostics } = loadSkills({
					agentDir,
					cwd,
					skillPaths: [extensionSkillDir],
				});

				const skill = skills.find((s) => s.name === "planning");
				expect(skill?.description).toBe("project");
				expect(skill?.sourceInfo.scope).toBe("project");
				expect(diagnostics.filter((d) => d.type === "collision")).toHaveLength(2);
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it("suppresses expected user overrides of bundled Daedalus fallback skills", () => {
			const tempDir = mkdtempSync(join(tmpdir(), "daedalus-skill-fallback-"));
			try {
				const agentDir = join(tempDir, "agent");
				const cwd = join(tempDir, "project");
				const userSkillDir = join(agentDir, "skills", "verification-before-completion");
				const bundledSkillDir = join(tempDir, "daedalus-extension", "verification-before-completion");
				mkdirSync(userSkillDir, { recursive: true });
				mkdirSync(bundledSkillDir, { recursive: true });

				writeFileSync(
					join(userSkillDir, "SKILL.md"),
					"---\nname: verification-before-completion\ndescription: user override\n---\nUser",
				);
				writeFileSync(
					join(bundledSkillDir, "SKILL.md"),
					"---\nname: verification-before-completion\ndescription: bundled fallback\n---\nBundled",
				);

				const metadata: PathMetadata = {
					source: "extension:daedalus",
					scope: "temporary",
					origin: "package",
					baseDir: bundledSkillDir,
				};
				const { skills, diagnostics } = loadSkills({
					agentDir,
					cwd,
					skillPaths: [userSkillDir, bundledSkillDir],
					includeDefaults: false,
					resourceMetadataByPath: new Map([[bundledSkillDir, metadata]]),
				});

				const skill = skills.find((s) => s.name === "verification-before-completion");
				expect(skill?.description).toBe("user override");
				expect(diagnostics.filter((d) => d.type === "collision")).toHaveLength(0);
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it("allows package-managed skills to use namespaced parent directories", () => {
			const tempDir = mkdtempSync(join(tmpdir(), "daedalus-skill-test-"));
			try {
				const skillDir = join(tempDir, "gstack-autoplan");
				mkdirSync(skillDir);
				const skillFile = join(skillDir, "SKILL.md");
				writeFileSync(skillFile, "---\nname: autoplan\ndescription: Package-managed skill.\n---\n# Autoplan\n");

				const metadata: PathMetadata = { source: "gstack", scope: "user", origin: "package", baseDir: tempDir };
				const { skills, diagnostics } = loadSkills({
					agentDir: emptyAgentDir,
					cwd: emptyCwd,
					skillPaths: [skillFile],
					includeDefaults: false,
					resourceMetadataByPath: new Map([[skillFile, metadata]]),
				});

				expect(skills).toHaveLength(1);
				expect(skills[0].name).toBe("autoplan");
				expect(
					diagnostics.some((d: ResourceDiagnostic) => d.message.includes("does not match parent directory")),
				).toBe(false);
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it("allows resource metadata on a skill directory to validate nested SKILL.md", () => {
			const tempDir = mkdtempSync(join(tmpdir(), "daedalus-skill-test-"));
			try {
				const skillDir = join(tempDir, "gstack-autoplan");
				mkdirSync(skillDir);
				const skillFile = join(skillDir, "SKILL.md");
				writeFileSync(skillFile, "---\nname: autoplan\ndescription: Extension-provided skill.\n---\n# Autoplan\n");

				const metadata: PathMetadata = { source: "gstack", scope: "user", origin: "package", baseDir: tempDir };
				const { skills, diagnostics } = loadSkills({
					agentDir: emptyAgentDir,
					cwd: emptyCwd,
					skillPaths: [skillDir],
					includeDefaults: false,
					resourceMetadataByPath: new Map([[skillDir, metadata]]),
				});

				expect(skills).toHaveLength(1);
				expect(skills[0].name).toBe("autoplan");
				expect(
					diagnostics.some((d: ResourceDiagnostic) => d.message.includes("does not match parent directory")),
				).toBe(false);
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it("allows trusted package skill aliases when the directory is not a suffix of the skill name", () => {
			const tempDir = mkdtempSync(join(tmpdir(), "daedalus-skill-alias-"));
			try {
				const skillDir = join(tempDir, "gstack-connect-chrome");
				mkdirSync(skillDir);
				const skillFile = join(skillDir, "SKILL.md");
				writeFileSync(
					skillFile,
					"---\nname: open-gstack-browser\ndescription: Trusted package alias.\n---\n# Browser\n",
				);

				const metadata: PathMetadata = { source: "gstack", scope: "user", origin: "package", baseDir: tempDir };
				const { skills, diagnostics } = loadSkills({
					agentDir: emptyAgentDir,
					cwd: emptyCwd,
					skillPaths: [skillDir],
					includeDefaults: false,
					resourceMetadataByPath: new Map([[skillDir, metadata]]),
				});

				expect(skills).toHaveLength(1);
				expect(skills[0].name).toBe("open-gstack-browser");
				expect(
					diagnostics.some((d: ResourceDiagnostic) => d.message.includes("does not match parent directory")),
				).toBe(false);
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it("allows explicit skills under known global skill roots to use namespaced parent directories", () => {
			const tempDir = mkdtempSync(join(tmpdir(), "daedalus-skill-test-"));
			try {
				const agentDir = join(tempDir, "agent");
				const skillDir = join(agentDir, "skills", "gstack-autoplan");
				mkdirSync(skillDir, { recursive: true });
				const skillFile = join(skillDir, "SKILL.md");
				writeFileSync(skillFile, "---\nname: autoplan\ndescription: Global skill.\n---\n# Autoplan\n");

				const { skills, diagnostics } = loadSkills({
					agentDir,
					cwd: emptyCwd,
					skillPaths: [skillFile],
					includeDefaults: false,
				});

				expect(skills).toHaveLength(1);
				expect(skills[0].name).toBe("autoplan");
				expect(
					diagnostics.some((d: ResourceDiagnostic) => d.message.includes("does not match parent directory")),
				).toBe(false);
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it("keeps parent-directory mismatch warnings for ordinary skills", () => {
			const tempDir = mkdtempSync(join(tmpdir(), "daedalus-skill-test-"));
			try {
				const skillDir = join(tempDir, "gstack-autoplan");
				mkdirSync(skillDir);
				const skillFile = join(skillDir, "SKILL.md");
				writeFileSync(skillFile, "---\nname: autoplan\ndescription: User-managed skill.\n---\n# Autoplan\n");

				const { skills, diagnostics } = loadSkills({
					agentDir: emptyAgentDir,
					cwd: emptyCwd,
					skillPaths: [skillFile],
					includeDefaults: false,
				});

				expect(skills).toHaveLength(1);
				expect(
					diagnostics.some((d: ResourceDiagnostic) => d.message.includes("does not match parent directory")),
				).toBe(true);
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it("should warn when skill path does not exist", () => {
			const { skills, diagnostics } = loadSkills({
				agentDir: emptyAgentDir,
				cwd: emptyCwd,
				skillPaths: ["/non/existent/path"],
			});
			expect(skills).toHaveLength(0);
			expect(diagnostics.some((d: ResourceDiagnostic) => d.message.includes("does not exist"))).toBe(true);
		});

		it("should expand ~ in skillPaths", () => {
			const homeSkillsDir = join(homedir(), ".pi/agent/skills");
			const { skills: withTilde } = loadSkills({
				agentDir: emptyAgentDir,
				cwd: emptyCwd,
				skillPaths: ["~/.pi/agent/skills"],
			});
			const { skills: withoutTilde } = loadSkills({
				agentDir: emptyAgentDir,
				cwd: emptyCwd,
				skillPaths: [homeSkillsDir],
			});
			expect(withTilde.length).toBe(withoutTilde.length);
		});
	});

	describe("collision handling", () => {
		it("should detect name collisions and keep first skill", () => {
			// Load from first directory
			const first = loadSkillsFromDir({
				dir: join(collisionFixturesDir, "first"),
				source: "first",
			});

			const second = loadSkillsFromDir({
				dir: join(collisionFixturesDir, "second"),
				source: "second",
			});

			// Simulate the collision behavior from loadSkills()
			const skillMap = new Map<string, Skill>();
			const collisionWarnings: Array<{ skillPath: string; message: string }> = [];

			for (const skill of first.skills) {
				skillMap.set(skill.name, skill);
			}

			for (const skill of second.skills) {
				const existing = skillMap.get(skill.name);
				if (existing) {
					collisionWarnings.push({
						skillPath: skill.filePath,
						message: `name collision: "${skill.name}" already loaded from ${existing.filePath}`,
					});
				} else {
					skillMap.set(skill.name, skill);
				}
			}

			expect(skillMap.size).toBe(1);
			expect(skillMap.get("calendar")?.sourceInfo.source).toBe("first");
			expect(collisionWarnings).toHaveLength(1);
			expect(collisionWarnings[0].message).toContain("name collision");
		});
	});
});
