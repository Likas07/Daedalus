# Daedalus Asaas Extension

Standalone Daedalus extension for guarded Asaas docs lookup and API access.

This repository is intentionally kept outside `.daedalus/extensions` so it is not auto-discovered on development machines. Clone it on client machines, then run the setup script to install it into the Daedalus extension directory for that machine or project.

## Requirements

- Bun
- Daedalus with the `@daedalus-pi/coding-agent` and `@daedalus-pi/ai` extension SDK packages available to the runtime

## Docs lookup behavior

`mcp_asaas_docs_query` connects to `https://docs.asaas.com/mcp` as a real MCP Streamable HTTP client using `@modelcontextprotocol/sdk`. It calls Asaas MCP tools such as `list-specs`, `search-endpoints`, and `search`.

If the MCP server is unavailable, the extension falls back to `https://docs.asaas.com/llms.txt` for read-only docs grounding. The fallback is degraded mode, not the normal path.

## Test

```sh
bun test
```

## Install into Daedalus

From this repository directory:

```sh
bun run setup
```

By default this symlinks the repository to the global Daedalus extension directory:

```text
~/.daedalus/agent/extensions/asaas
```

Options:

```sh
# Install into a project-local Daedalus extension directory
bun run setup -- --scope project --project-dir /path/to/client/project

# Copy instead of symlink
bun run setup -- --mode copy

# Overwrite an existing installed extension
bun run setup -- --force

# Explicit target directory
bun run setup -- --target /path/to/.daedalus/extensions/asaas
```

## Configuration

Set the Asaas API token in the environment used to run Daedalus:

```sh
export ASAAS_ACCESS_TOKEN="..."
```

Optional:

```sh
export ASAAS_BASE_URL="https://api.asaas.com/v3"
```

The extension redacts tokens and secret-looking fields from tool results, defaults mutations to dry-run, and asks for confirmation before live mutations when UI confirmation is available.
