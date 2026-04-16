export const DANGEROUS_BASH_PATTERNS: RegExp[] = [/\brm\s+(-rf?|--recursive)/i, /\bsudo\b/i, /\b(chmod|chown)\b.*777/i];

export function isDangerousCommand(command: string): boolean {
	return DANGEROUS_BASH_PATTERNS.some((pattern) => pattern.test(command));
}

export const DEFAULT_PROTECTED_PATHS: string[] = [".env", ".git/", "node_modules/"];

export function isProtectedPath(path: string, protectedPaths: string[] = DEFAULT_PROTECTED_PATHS): boolean {
	return protectedPaths.some((protectedPath) => path.includes(protectedPath));
}
