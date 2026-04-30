import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type AppRouter, type RuntimeFactory, startAppServer } from "@daedalus-pi/app-server";
import type { AppEvent } from "@daedalus-pi/app-server-protocol";
import { $ } from "bun";

interface Args {
	readonly host: string;
	readonly port: number;
	readonly artifactDir: string;
	readonly distDir: string;
	readonly token: string;
}

interface FixtureIds {
	readonly projectId: string;
	readonly threadId: string;
	readonly turnId: string;
	readonly workspaceTargetId: string;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main(argv = Bun.argv.slice(2)): Promise<void> {
	const args = parseArgs(argv);
	const distDir = resolve(args.distDir);
	if (!existsSync(join(distDir, "index.html"))) {
		throw new Error(`React GUI dist not found at ${distDir}; run bun --cwd=packages/react-gui run build first.`);
	}

	mkdirSync(args.artifactDir, { recursive: true });
	const fixtureRoot = await mkdtemp(join(resolve(args.artifactDir), "fixture-"));
	const projectDir = join(fixtureRoot, "project");
	const databasePath = join(fixtureRoot, "app.sqlite");
	const agentDir = join(fixtureRoot, "agent");
	mkdirSync(agentDir, { recursive: true });

	await seedGitProject(projectDir);

	const server = await startAppServer({
		databasePath,
		host: args.host,
		port: args.port,
		token: args.token,
		runtimeFactory: createFakeRuntimeFactory(),
		agentDir,
		serveGui: true,
		guiDistDir: distDir,
		projectRoot: projectDir,
	});

	const ids = await seedThread(server.router, projectDir);
	const threadUrl = `${server.httpUrl}/?threadId=${encodeURIComponent(ids.threadId)}`;
	process.stdout.write(
		`${JSON.stringify({
			httpUrl: server.httpUrl,
			threadUrl,
			threadId: ids.threadId,
			projectId: ids.projectId,
			workspaceTargetId: ids.workspaceTargetId,
			databasePath,
			projectDir,
			artifactDir: fixtureRoot,
		})}\n`,
	);

	await waitForShutdown(async () => {
		await server.stop();
	});
}

function parseArgs(argv: readonly string[]): Args {
	const args = {
		host: Bun.env.DAEDALUS_REACT_GUI_VISUAL_HOST ?? "127.0.0.1",
		port: Number(Bun.env.DAEDALUS_REACT_GUI_VISUAL_PORT ?? "0"),
		artifactDir: Bun.env.DAEDALUS_REACT_GUI_VISUAL_ARTIFACT_DIR ?? join(repoRoot, ".daedalus", "t3code-visual-qa"),
		distDir: Bun.env.DAEDALUS_REACT_GUI_VISUAL_DIST ?? join(repoRoot, "packages", "react-gui", "dist"),
		token: Bun.env.DAEDALUS_REACT_GUI_VISUAL_TOKEN ?? "react-gui-visual-smoke-token",
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === "--host" && next) {
			args.host = next;
			index += 1;
		} else if (arg === "--port" && next) {
			args.port = Number(next);
			index += 1;
		} else if (arg === "--artifact-dir" && next) {
			args.artifactDir = resolve(next);
			index += 1;
		} else if (arg === "--dist" && next) {
			args.distDir = resolve(next);
			index += 1;
		} else if (arg === "--token" && next) {
			args.token = next;
			index += 1;
		}
	}

	if (!Number.isFinite(args.port) || args.port < 0) throw new Error(`Invalid --port: ${args.port}`);
	return args;
}

function createFakeRuntimeFactory(): RuntimeFactory {
	return async (input) => {
		const listeners = new Set<(event: unknown) => void>();
		return {
			cwd: input.cwd,
			session: {
				sessionFile: `fixture://${input.sessionId ?? "thread"}`,
				subscribe(listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				async prompt(prompt) {
					for (const listener of listeners) listener({ type: "agent_start" });
					for (const listener of listeners) {
						listener({
							type: "message_end",
							message: {
								id: `fixture-response-${Date.now()}`,
								role: "assistant",
								content: `Fixture runtime received: ${prompt.slice(0, 120)}`,
							},
						});
					}
					for (const listener of listeners) listener({ type: "agent_end" });
				},
				async abort() {
					for (const listener of listeners) listener({ type: "agent_end" });
				},
			},
			async applyRuntimeOptions() {},
			async dispose() {
				listeners.clear();
			},
		};
	};
}

async function seedGitProject(projectDir: string): Promise<void> {
	mkdirSync(join(projectDir, "src"), { recursive: true });
	mkdirSync(join(projectDir, "docs"), { recursive: true });
	writeFileSync(
		join(projectDir, "README.md"),
		"# Visual Fixture Project\n\nA temporary git repository for Daedalus React GUI visual smoke tests.\n",
	);
	writeFileSync(
		join(projectDir, "src", "agent-workspace.ts"),
		["export function summarizeWorkspace(): string {", '\treturn "workspace ready";', "}", ""].join("\n"),
	);
	writeFileSync(
		join(projectDir, "docs", "plan.md"),
		"# Plan\n\n- [ ] Render thread workspace\n- [ ] Review approval, diff, and terminal panels\n",
	);

	try {
		await $`git init --initial-branch=main`.cwd(projectDir).quiet();
	} catch {
		await $`git init`.cwd(projectDir).quiet();
		await $`git checkout -b main`.cwd(projectDir).quiet();
	}
	await $`git config user.email daedalus-visual-fixture@example.invalid`.cwd(projectDir).quiet();
	await $`git config user.name "Daedalus Visual Fixture"`.cwd(projectDir).quiet();
	await $`git add README.md src/agent-workspace.ts docs/plan.md`.cwd(projectDir).quiet();
	await $`git commit -m seed-visual-fixture`.cwd(projectDir).quiet();

	writeFileSync(
		join(projectDir, "src", "agent-workspace.ts"),
		[
			"export function summarizeWorkspace(): string {",
			'\treturn "workspace ready with approval, diff, and terminal context";',
			"}",
			"",
			"export const visibleSmokeState = {",
			'\tthread: "waiting for approval",',
			'\tdiff: "2 files changed",',
			'\tterminal: "bun test completed",',
			"};",
			"",
		].join("\n"),
	);
	writeFileSync(
		join(projectDir, "docs", "plan.md"),
		[
			"# Plan",
			"",
			"- [x] Render thread workspace",
			"- [x] Review approval, diff, and terminal panels",
			"- [ ] Capture visual smoke artifacts",
			"",
		].join("\n"),
	);
}

async function seedThread(router: AppRouter, projectDir: string): Promise<FixtureIds> {
	const projectOpen = (await router.handle({
		method: "project/open",
		params: { path: projectDir },
	} as Parameters<AppRouter["handle"]>[0])) as { readonly projectId: string };
	const sessionStart = (await router.handle({
		method: "session/start",
		params: {
			projectId: projectOpen.projectId,
			startTarget: {
				mode: "base-checkout",
				projectId: projectOpen.projectId,
				confirmation: { confirmed: true, evidence: "temporary visual smoke fixture" },
			},
		},
	} as Parameters<AppRouter["handle"]>[0])) as { readonly sessionId: string };

	const ids: FixtureIds = {
		projectId: projectOpen.projectId,
		threadId: sessionStart.sessionId,
		turnId: "turn-visual-fixture-1",
		workspaceTargetId: `base:${projectOpen.projectId}`,
	};
	appendRepresentativeEvents(router, ids, projectDir);
	return ids;
}

function appendRepresentativeEvents(router: AppRouter, ids: FixtureIds, projectDir: string): void {
	let index = 0;
	const at = (seconds: number) => new Date(Date.UTC(2026, 3, 30, 12, 0, seconds)).toISOString();
	const append = (type: string, payload: Record<string, unknown>, ts = at(index)): void => {
		index += 1;
		router.append({
			id: `visual-fixture-${String(index).padStart(2, "0")}`,
			type,
			ts,
			sessionId: ids.threadId,
			payload: { sessionId: ids.threadId, projectId: ids.projectId, ...payload },
		} as AppEvent);
	};

	append("turn/started", {
		turnId: ids.turnId,
		role: "user",
		prompt: "Please make the React GUI thread workspace show approvals, diffs, and terminal output.",
		content: "Please make the React GUI thread workspace show approvals, diffs, and terminal output.",
	});
	append("agent/message_end", {
		turnId: ids.turnId,
		message: {
			id: "message-visual-assistant-1",
			role: "assistant",
			content:
				"I staged a visual QA fixture with a pending approval, a changed workspace diff, and terminal output for review.",
		},
	});
	append("checkpoint/created", {
		checkpointId: "checkpoint-visual-1",
		turnId: ids.turnId,
		label: "Tool activity: inspected src/agent-workspace.ts and docs/plan.md",
		metadata: { toolName: "read", files: ["src/agent-workspace.ts", "docs/plan.md"] },
	});
	append("approval/requested", {
		approvalId: "approval-visual-1",
		turnId: ids.turnId,
		workspaceTargetId: ids.workspaceTargetId,
		status: "pending",
		kind: "tool",
		title: "Approve workspace change",
		summary: "Allow the fixture agent to keep the representative diff in the temporary project.",
		request: {
			kind: "tool",
			toolName: "write",
			toolCallId: "tool-visual-write-1",
			turnId: ids.turnId,
			workspaceTargetId: ids.workspaceTargetId,
			title: "Approve workspace change",
			summary: "Modify src/agent-workspace.ts and docs/plan.md for the visual smoke fixture.",
		},
	});
	append("terminal/started", {
		terminalId: "terminal-visual-1",
		turnId: ids.turnId,
		workspaceTargetId: ids.workspaceTargetId,
		status: "running",
		cwd: projectDir,
		shell: "bash",
		cols: 100,
		rows: 28,
	});
	append("terminal/output", {
		terminalId: "terminal-visual-1",
		turnId: ids.turnId,
		workspaceTargetId: ids.workspaceTargetId,
		text: "$ bun test\n✓ visual fixture smoke state seeded\n✓ terminal output replay available\n",
	});
	append("turn/completed", {
		turnId: ids.turnId,
		status: "completed",
		summary: "Visual QA fixture seeded with messages, activity, approval, diff, and terminal output.",
	});
}

async function waitForShutdown(stop: () => Promise<void>): Promise<void> {
	let resolveShutdown: (() => void) | undefined;
	const shutdown = new Promise<void>((resolve) => {
		resolveShutdown = resolve;
	});
	const requestShutdown = () => resolveShutdown?.();
	process.once("SIGTERM", requestShutdown);
	process.once("SIGINT", requestShutdown);
	await shutdown;
	process.off("SIGTERM", requestShutdown);
	process.off("SIGINT", requestShutdown);
	await stop();
}

if (import.meta.main) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
