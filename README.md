# Daedalus

AI coding agent for the terminal. Self-contained fork of [Pi](https://github.com/badlogic/pi-mono) with baked-in extensions and Bun runtime.

## Installation

Requires [Bun](https://bun.sh/) >= 1.3.7.

```bash
git clone https://github.com/Likas07/Daedalus.git
cd Daedalus
bun install
bun link --cwd packages/coding-agent
```

## Usage

```bash
daedalus                    # Start interactive session
dae                         # Short alias
daedalus "your prompt"      # Non-interactive mode
```

## Packages

| Package | Description |
|---|---|
| `@daedalus-pi/coding-agent` | Main CLI with tools, extensions, TUI |
| `@daedalus-pi/ai` | Unified LLM API (Anthropic, OpenAI, Google, Bedrock, Mistral) |
| `@daedalus-pi/agent-core` | Agent framework with transport abstraction |
| `@daedalus-pi/tui` | Terminal UI library with differential rendering |
| `@daedalus-pi/web-ui` | Web UI components for chat interfaces |

## Development

```bash
bun run dev          # Run the CLI
bun run check        # Lint + type check
bun run test         # Run tests
```

## License

MIT
