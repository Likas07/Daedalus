import { basename, resolve } from "node:path";
import type { RootBoundaryViolation, RootScopedTarget } from "@daedalus-pi/app-server-protocol";
import { assertPathWithinRoot, RootBoundaryError } from "../workspaces/root-boundary";

export type TerminalGuardStatus = "unchecked" | "valid" | "blocked" | "violated";

export interface TerminalSafetyResult {
	readonly cwd: string;
	readonly shell: string;
	readonly guardStatus: TerminalGuardStatus;
	readonly guardTarget?: RootScopedTarget;
	readonly boundaryViolation?: RootBoundaryViolation;
	readonly rejectedReason?: string;
}

export interface TerminalSafetyOptions {
	readonly defaultShell?: string;
	readonly allowedShells?: readonly string[];
	readonly maxInputBytes?: number;
}

export const DEFAULT_TERMINAL_MAX_INPUT_BYTES = 64 * 1024;
const SAFE_SHELL_BASENAMES = new Set(["sh", "bash", "zsh", "fish", "dash"]);
const DEFAULT_ALLOWED_SHELLS = ["/bin/sh", "/bin/bash", "/bin/zsh", "/usr/bin/bash", "/usr/bin/zsh", "/usr/bin/fish"];

export class TerminalSafetyService {
	readonly maxInputBytes: number;
	private readonly allowedShells: readonly string[];
	private readonly defaultShell: string;

	constructor(options: TerminalSafetyOptions = {}) {
		this.allowedShells = options.allowedShells ?? DEFAULT_ALLOWED_SHELLS;
		this.defaultShell = this.isAllowedShell(options.defaultShell ?? process.env.SHELL ?? "")
			? (options.defaultShell ?? process.env.SHELL ?? this.firstUsableDefaultShell())
			: this.firstUsableDefaultShell();
		this.maxInputBytes = options.maxInputBytes ?? DEFAULT_TERMINAL_MAX_INPUT_BYTES;
	}

	async validateCreate(input: {
		readonly cwd: string;
		readonly shell?: string;
		readonly owner?: string;
		readonly guardTarget?: RootScopedTarget;
		readonly requireRootBoundary?: boolean;
	}): Promise<TerminalSafetyResult> {
		if (input.owner != null && !/^[\w .:@-]{1,128}$/.test(input.owner)) {
			return this.blocked("invalid-terminal-owner", input.guardTarget);
		}

		const cwd = resolve(input.cwd);
		if (input.guardTarget) {
			try {
				const guardTarget = await assertPathWithinRoot({
					root: input.guardTarget.canonicalRootPath,
					candidate: cwd,
					purpose: "terminal",
					projectId: input.guardTarget.projectId,
				});
				return {
					cwd: guardTarget.canonicalTargetPath,
					shell: this.normalizeShell(input.shell),
					guardStatus: "valid",
					guardTarget,
				};
			} catch (error) {
				if (error instanceof RootBoundaryError) {
					return {
						cwd,
						shell: this.normalizeShell(input.shell),
						guardStatus: "violated",
						guardTarget: error.violation.target,
						boundaryViolation: error.violation,
						rejectedReason: error.violation.reason,
					};
				}
				throw error;
			}
		}

		if (input.requireRootBoundary) return this.blocked("missing-root-boundary", input.guardTarget, cwd, input.shell);
		return { cwd, shell: this.normalizeShell(input.shell), guardStatus: "unchecked" };
	}

	validateInput(data: string): { ok: true } | { ok: false; rejectedReason: string } {
		if (Buffer.byteLength(data, "utf8") > this.maxInputBytes)
			return { ok: false, rejectedReason: "terminal-input-too-large" };
		return { ok: true };
	}

	normalizeShell(shell?: string): string {
		const candidate = shell?.trim() || this.defaultShell;
		if (this.isAllowedShell(candidate)) return candidate;
		return this.defaultShell;
	}

	private blocked(reason: string, guardTarget?: RootScopedTarget, cwd = "", shell?: string): TerminalSafetyResult {
		return {
			cwd: cwd ? resolve(cwd) : cwd,
			shell: this.normalizeShell(shell),
			guardStatus: "blocked",
			guardTarget,
			rejectedReason: reason,
		};
	}

	private isAllowedShell(shell: string): boolean {
		if (!shell.startsWith("/")) return false;
		if (!SAFE_SHELL_BASENAMES.has(basename(shell))) return false;
		return this.allowedShells.includes(shell);
	}

	private firstUsableDefaultShell(): string {
		return this.allowedShells[0] ?? "/bin/sh";
	}
}
