import * as path from "node:path";
import type { ToolSession } from ".";
import { resolveToCwd } from "./path-utils";
import { ToolError } from "./tool-errors";

export function normalizeRelativePath(value: string): string {
	const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/g, "").replace(/^\/+/, "");
	return normalized.length > 0 ? normalized : ".";
}

export function scopeMatchesPath(scope: string, relativePath: string): boolean {
	const normalizedScope = normalizeRelativePath(scope);
	const normalizedPath = normalizeRelativePath(relativePath);
	if (new Bun.Glob(normalizedScope).match(normalizedPath)) {
		return true;
	}
	if (normalizedScope.endsWith("/**")) {
		const prefix = normalizedScope.slice(0, -3).replace(/\/$/, "");
		return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
	}
	return normalizedPath === normalizedScope || normalizedPath.startsWith(`${normalizedScope}/`);
}

function getScopedRelativePath(session: ToolSession, targetPath: string, resolved: boolean): string {
	const absolutePath = resolved ? targetPath : resolveToCwd(targetPath, session.cwd);
	const relativePath = path.relative(session.cwd, absolutePath);
	if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
		throw new ToolError(`Scoped task path escapes the delegated workspace: ${targetPath}`);
	}
	return normalizeRelativePath(relativePath);
}

function getExplicitAllowedEditScopes(session: ToolSession): string[] {
	return Array.isArray(session.allowedEditScopes) ? session.allowedEditScopes.filter(Boolean) : [];
}

export function getAllowedToolScopes(session: ToolSession, toolName: string): string[] {
	const scopes = session.allowedToolScopes?.[toolName];
	return Array.isArray(scopes) ? scopes.filter(Boolean) : [];
}

export function getAllowedEditScopes(session: ToolSession): string[] {
	const explicitScopes = getExplicitAllowedEditScopes(session);
	const toolScopes = Object.values(session.allowedToolScopes ?? {})
		.flat()
		.filter(Boolean);
	return Array.from(new Set([...explicitScopes, ...toolScopes]));
}

export function enforceDelegatedToolScope(
	session: ToolSession,
	toolName: string,
	targetPath: string,
	options: { resolved?: boolean } = {},
): void {
	const allowedScopes = getAllowedToolScopes(session, toolName);
	const fallbackScopes = allowedScopes.length > 0 ? allowedScopes : getExplicitAllowedEditScopes(session);
	if (fallbackScopes.length === 0) {
		return;
	}
	const relativePath = getScopedRelativePath(session, targetPath, options.resolved === true);
	if (fallbackScopes.some(scope => scopeMatchesPath(scope, relativePath))) {
		return;
	}
	throw new ToolError(
		`Path '${relativePath}' is outside the delegated ${toolName} scope. Allowed scopes: ${fallbackScopes.join(", ")}`,
	);
}

export function enforceDelegatedEditScope(
	session: ToolSession,
	targetPath: string,
	options: { resolved?: boolean } = {},
): void {
	const explicitScopes = getExplicitAllowedEditScopes(session);
	const relativePath = getScopedRelativePath(session, targetPath, options.resolved === true);
	if (explicitScopes.length === 0) {
		if (Object.keys(session.allowedToolScopes ?? {}).length === 0) {
			return;
		}
		throw new ToolError(`Path '${relativePath}' is outside the delegated edit scope. Allowed scopes: none`);
	}
	if (explicitScopes.some(scope => scopeMatchesPath(scope, relativePath))) {
		return;
	}
	throw new ToolError(
		`Path '${relativePath}' is outside the delegated edit scope. Allowed scopes: ${explicitScopes.join(", ")}`,
	);
}
