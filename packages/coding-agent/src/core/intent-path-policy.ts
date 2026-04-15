import path from "node:path";
import type { PlanningArtifactKind } from "./intent-gate.js";

export const PLANNING_ALLOWED_DIRECTORIES = ["docs", "plans", "specs", "design"] as const;
export const PLANNING_ALLOWED_ROOT_FILES = ["README.md", "AGENTS.md", "CLAUDE.md"] as const;

const BLOCKED_SEGMENTS = new Set([
	"node_modules",
	"dist",
	"build",
	"coverage",
	".git",
	".svn",
	".hg",
]);

function normalizeRelativePath(filePath: string, cwd: string): string | undefined {
	const absolute = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(cwd, filePath);
	const relative = path.relative(cwd, absolute);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		return undefined;
	}
	const normalized = relative.split(path.sep).join("/");
	return normalized.length > 0 ? normalized : undefined;
}

function hasBlockedSegment(relativePath: string): boolean {
	return relativePath
		.split("/")
		.some((segment, index) => index > 0 && (BLOCKED_SEGMENTS.has(segment) || segment.startsWith(".")));
}

export function inferArtifactKindFromPath(filePath: string): PlanningArtifactKind | undefined {
	const normalized = filePath.replace(/\\/g, "/");
	if (normalized === "README.md" || normalized.startsWith("docs/")) return "docs";
	if (normalized.startsWith("plans/")) return "plan";
	if (normalized.startsWith("specs/")) return "spec";
	if (normalized.startsWith("design/")) return "design";
	return undefined;
}

export function getPlanningDirectoryForArtifactKind(kind: PlanningArtifactKind | undefined): (typeof PLANNING_ALLOWED_DIRECTORIES)[number] {
	switch (kind) {
		case "docs":
			return "docs";
		case "spec":
			return "specs";
		case "design":
			return "design";
		case "plan":
		default:
			return "plans";
	}
}

function slugifyTopic(topic: string | undefined): string {
	const slug = (topic ?? "plan")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
	return slug || "plan";
}

export function resolvePlanningPath(options: {
	cwd: string;
	explicitPath?: string;
	artifactKind?: PlanningArtifactKind;
	topic?: string;
	date?: string;
}): string {
	if (options.explicitPath) {
		return options.explicitPath;
	}
	const kind = options.artifactKind ?? "plan";
	const directory = getPlanningDirectoryForArtifactKind(kind);
	const slug = slugifyTopic(options.topic);
	if (kind === "docs") {
		return `${directory}/${slug}.md`;
	}
	const date = options.date ?? new Date().toISOString().slice(0, 10);
	return `${directory}/${date}-${slug}.md`;
}

export function suggestPlanningPath(filePath: string | undefined, cwd: string, artifactKind?: PlanningArtifactKind): string {
	const fallback = resolvePlanningPath({ cwd, artifactKind });
	if (!filePath) {
		return fallback;
	}
	const normalized = normalizeRelativePath(filePath, cwd);
	if (!normalized) {
		return fallback;
	}
	const baseName = path.posix.basename(normalized).replace(/\.[^.]*$/u, "") || "plan";
	return resolvePlanningPath({ cwd, artifactKind, topic: baseName });
}

export function isAllowedPlanningDirPath(dirPath: string, cwd: string): boolean {
	const normalized = normalizeRelativePath(dirPath, cwd);
	if (!normalized) {
		return false;
	}
	const segments = normalized.split("/");
	if (segments.length < 1) {
		return false;
	}
	if (!PLANNING_ALLOWED_DIRECTORIES.includes(segments[0] as (typeof PLANNING_ALLOWED_DIRECTORIES)[number])) {
		return false;
	}
	if (hasBlockedSegment(normalized)) {
		return false;
	}
	return true;
}

export function isAllowedPlanningPath(filePath: string, cwd: string): boolean {
	const normalized = normalizeRelativePath(filePath, cwd);
	if (!normalized) {
		return false;
	}
	if (!normalized.toLowerCase().endsWith(".md")) {
		return false;
	}
	if (PLANNING_ALLOWED_ROOT_FILES.includes(normalized as (typeof PLANNING_ALLOWED_ROOT_FILES)[number])) {
		return true;
	}
	const segments = normalized.split("/");
	if (segments.length < 2) {
		return false;
	}
	if (!PLANNING_ALLOWED_DIRECTORIES.includes(segments[0] as (typeof PLANNING_ALLOWED_DIRECTORIES)[number])) {
		return false;
	}
	if (hasBlockedSegment(normalized)) {
		return false;
	}
	return true;
}
