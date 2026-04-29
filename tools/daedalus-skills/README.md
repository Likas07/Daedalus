# daedalus-skills

Reusable Daedalus skill pack for planning and branch-completion workflows.

This repository contains:

- `writing-plans`
  - `SKILL.md`
  - `plan-document-reviewer-prompt.md`
- `executing-plans`
  - `SKILL.md`
- `finishing-a-development-branch`
  - `SKILL.md`

The installer is intentionally dependency-free beyond [Bun](https://bun.sh/). It does not install anything until you run an `install` command.

## Commands

```bash
bun run setup --help
bun run setup list
bun run setup install --project /path/to/project --mode symlink
bun run setup install --project /path/to/project --mode copy --force
bun run setup install --global --mode symlink
bun run setup install --global --mode copy --dry-run
```

## Install targets

- Global install: `~/.daedalus/agent/skills`
- Project install: `<project>/.daedalus/skills`

All bundled skills are installed together.

## Install modes

- `--mode symlink` links each target skill directory back to this repository.
- `--mode copy` copies each skill directory into the target.

If a target skill directory already exists, the installer stops unless `--force` is passed. With `--force`, the existing target directory or symlink is removed before installing.

Use `--dry-run` to preview the target and per-skill actions without writing files.

## Development checks

```bash
bun run check
```

The check command prints help, lists bundled skills, and runs a dry-run global copy install.
