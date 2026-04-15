import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FAKE_SSH_SCRIPT = `#!/usr/bin/env bash
set -uo pipefail

remote="\${1-}"
shift || true
cmd="\${1-}"
shift || true

if [[ -n "\${FAKE_SSH_FAIL_MATCH:-}" && "$cmd" == *"$FAKE_SSH_FAIL_MATCH"* ]]; then
  if [[ -n "\${FAKE_SSH_STDERR:-}" ]]; then
    printf '%s' "$FAKE_SSH_STDERR" >&2
  fi
  exit "\${FAKE_SSH_FAIL_EXIT_CODE:-1}"
fi

/bin/sh -c "$cmd"
status=$?

case "\${FAKE_SSH_TAMPER_MODE:-}" in
  truncate)
    if [[ -n "\${FAKE_SSH_TAMPER_PATH:-}" ]]; then
      : > "$FAKE_SSH_TAMPER_PATH"
    fi
    ;;
  wrong)
    if [[ -n "\${FAKE_SSH_TAMPER_PATH:-}" ]]; then
      printf '%s' "\${FAKE_SSH_TAMPER_CONTENT:-wrong}" > "$FAKE_SSH_TAMPER_PATH"
    fi
    ;;
esac

if [[ -n "\${FAKE_SSH_STDERR:-}" ]]; then
  printf '%s' "$FAKE_SSH_STDERR" >&2
fi

exit "$status"
`;

export const FAKE_SSH_ENV_KEYS = [
	"FAKE_SSH_FAIL_MATCH",
	"FAKE_SSH_FAIL_EXIT_CODE",
	"FAKE_SSH_STDERR",
	"FAKE_SSH_TAMPER_MODE",
	"FAKE_SSH_TAMPER_PATH",
	"FAKE_SSH_TAMPER_CONTENT",
] as const;

export interface FakeSshEnvironment {
	localCwd: string;
	remote: string;
	remoteCwd: string;
	cleanup: () => Promise<void>;
}

export function clearFakeSshBehavior(): void {
	for (const key of FAKE_SSH_ENV_KEYS) {
		delete process.env[key];
	}
}

export async function createFakeSshEnvironment(prefix = "pi"): Promise<FakeSshEnvironment> {
	const root = await mkdtemp(join(tmpdir(), `dae-fake-ssh-${prefix}-`));
	const binDir = join(root, "bin");
	const localCwd = join(root, "local workspace");
	const remoteCwd = join(root, "remote workspace");
	const sshPath = join(binDir, "ssh");
	const originalPath = process.env.PATH;

	await mkdir(binDir, { recursive: true });
	await mkdir(localCwd, { recursive: true });
	await mkdir(remoteCwd, { recursive: true });
	await writeFile(sshPath, FAKE_SSH_SCRIPT, "utf8");
	await chmod(sshPath, 0o755);

	process.env.PATH = [binDir, originalPath].filter(Boolean).join(":");
	clearFakeSshBehavior();

	return {
		localCwd,
		remote: "fake-remote",
		remoteCwd,
		cleanup: async () => {
			process.env.PATH = originalPath;
			clearFakeSshBehavior();
			await rm(root, { recursive: true, force: true });
		},
	};
}
