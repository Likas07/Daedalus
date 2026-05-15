> daedalus can create skills. Ask it to build one for your use case.

# Skills

Skills are self-contained capability packages that the agent loads on-demand. A skill provides specialized workflows, setup instructions, helper scripts, and reference documentation for specific tasks.

Daedalus implements the [Agent Skills standard](https://agentskills.io/specification), warning about violations but remaining lenient.

## Table of Contents

- [Locations](#locations)
- [Built-in Daedalus Skills](#built-in-daedalus-skills)
- [How Skills Work](#how-skills-work)
- [Skill Commands](#skill-commands)
- [Skill Structure](#skill-structure)
- [Frontmatter](#frontmatter)
- [Validation](#validation)
- [Example](#example)
- [Skill Repositories](#skill-repositories)

## Locations

> **Security:** Skills can instruct the model to perform any action and may include executable code the model invokes. Review skill content before use.

Daedalus loads skills from these sources, in precedence order:

1. **Project** skills:
   - `.daedalus/skills/`
   - `.agents/skills/` in `cwd` and ancestor directories (up to git repo root, or filesystem root when not in a repo)
2. **User** skills:
   - `~/.daedalus/agent/skills/`
   - `~/.agents/skills/`
3. **Extension** skills from enabled Daedalus extensions and packages (`skills/` directories or `pi.skills` entries in `package.json`)
4. **Built-in** Daedalus skills bundled with the coding-agent package

Settings (`skills` array with files or directories) and CLI `--skill <path>` entries are explicit additions. `--skill` is repeatable and still loads when discovery is disabled with `--no-skills`.
Discovery rules:
- In `~/.daedalus/agent/skills/` and `.daedalus/skills/`, direct root `.md` files are discovered as individual skills
- In all skill locations, directories containing `SKILL.md` are discovered recursively
- In `~/.agents/skills/` and project `.agents/skills/`, root `.md` files are ignored

Disable discovery with `--no-skills` (explicit `--skill` paths still load).


## Built-in Daedalus Skills

Daedalus ships a small set of built-in skills used by the default workflow:

- `writing-plans` - turns requirements into detailed, step-by-step implementation plans.
- `executing-plans` - executes written implementation plans, chooses execution strategy per task, and preserves review checkpoints.
- `verification-before-completion` - runs fresh verification before reporting work complete.

Built-ins are normal Agent Skills. They appear in the same discovery output, can be invoked with `/skill:name`, and can be overridden by defining a skill with the same name in a higher-precedence source. The effective precedence is **project > user > extension > built-in**.
### Using Skills from Other Harnesses

To use skills from Claude Code or OpenAI Codex, add their directories to settings:

```json
{
  "skills": [
    "~/.claude/skills",
    "~/.codex/skills"
  ]
}
```

For project-level Claude Code skills, add to `.daedalus/settings.json`:

```json
{
  "skills": ["../.claude/skills"]
}
```

## How Skills Work

1. At startup, daedalus scans skill locations and extracts names and descriptions
2. The system prompt includes available skills in XML format per the [specification](https://agentskills.io/integrate-skills)
3. When a task matches, the agent uses `read` to load the full SKILL.md (models don't always do this; use prompting or `/skill:name` to force it)
4. The agent follows the instructions, using relative paths to reference scripts and assets

This is progressive disclosure: only descriptions are always in context, full instructions load on-demand.

## Skill Commands

Skills register as `/skill:name` commands:

```bash
/skill:brave-search           # Load and execute the skill
/skill:pdf-tools extract      # Load skill with arguments
```

Arguments after the command are appended to the skill content as `User: <args>`.

Toggle skill commands via `/settings` in interactive mode or in `settings.json`:

```json
{
  "enableSkillCommands": true
}
```

## Skill Structure

A skill is a directory with a `SKILL.md` file. Everything else is freeform.

```
my-skill/
├── SKILL.md              # Required: frontmatter + instructions
├── scripts/              # Helper scripts
│   └── process.sh
├── references/           # Detailed docs loaded on-demand
│   └── api-reference.md
└── assets/
    └── template.json
```

### SKILL.md Format

```markdown
---
name: my-skill
description: What this skill does and when to use it. Be specific.
---

# My Skill

## Setup

Run once before first use:
\`\`\`bash
cd /path/to/skill && bun install
\`\`\`

## Usage

\`\`\`bash
./scripts/process.sh <input>
\`\`\`
```

Use relative paths from the skill directory:

```markdown
See [the reference guide](references/REFERENCE.md) for details.
```

## Frontmatter

Per the [Agent Skills specification](https://agentskills.io/specification#frontmatter-required):

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Max 64 chars. Lowercase a-z, 0-9, hyphens. Must match parent directory. |
| `description` | Yes | Max 1024 chars. What the skill does and when to use it. |
| `license` | No | License name or reference to bundled file. |
| `compatibility` | No | Max 500 chars. Environment requirements. |
| `metadata` | No | Arbitrary key-value mapping. |
| `allowed-tools` | No | Space-delimited list of pre-approved tools (experimental). |
| `disable-model-invocation` | No | When `true`, skill is hidden from system prompt. Users must use `/skill:name`. |

### Name Rules

- 1-64 characters
- Lowercase letters, numbers, hyphens only
- No leading/trailing hyphens
- No consecutive hyphens
- Must match parent directory name

Valid: `pdf-processing`, `data-analysis`, `code-review`
Invalid: `PDF-Processing`, `-pdf`, `pdf--processing`

### Description Best Practices

The description determines when the agent loads the skill. Be specific.

Good:
```yaml
description: Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents.
```

Poor:
```yaml
description: Helps with PDFs.
```

## Validation

Daedalus validates skills against the Agent Skills standard. Most issues produce warnings but still load the skill:

- Name doesn't match parent directory
- Name exceeds 64 characters or contains invalid characters
- Name starts/ends with hyphen or has consecutive hyphens
- Description exceeds 1024 characters

Unknown frontmatter fields are ignored.

**Exception:** Skills with missing description are not loaded.

Name collisions (same name from different locations) warn and keep the higher-precedence skill. Precedence is project > user > extension > built-in.

## Example

```
brave-search/
├── SKILL.md
├── search.js
└── content.js
```

**SKILL.md:**
```markdown
---
name: brave-search
description: Web search and content extraction via Brave Search API. Use for searching documentation, facts, or any web content.
---

# Brave Search

## Setup

\`\`\`bash
cd /path/to/brave-search && bun install
\`\`\`

## Search

\`\`\`bash
./search.js "query"              # Basic search
./search.js "query" --content    # Include page content
\`\`\`

## Extract Page Content

\`\`\`bash
./content.js https://example.com
\`\`\`
```

## Skill Repositories

- [Anthropic Skills](https://github.com/anthropics/skills) - Document processing (docx, pdf, pptx, xlsx), web development
- [Pi Skills](https://github.com/badlogic/pi-skills) - Web search, browser automation, Google APIs, transcription
