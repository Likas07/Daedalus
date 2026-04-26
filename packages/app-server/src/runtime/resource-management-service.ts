import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export type ResourceKind = "extension" | "skill" | "prompt-template" | "theme" | "package";
export type ResourceStatus = "enabled" | "disabled" | "error" | "missing";

export interface ManagedResource {
	readonly id: string;
	readonly name: string;
	readonly kind: ResourceKind;
	readonly status: ResourceStatus;
	readonly enabled: boolean;
	readonly source: "global" | "project" | "built-in" | "package";
	readonly sourcePath?: string;
	readonly version?: string;
	readonly diagnostics: readonly string[];
	readonly disabledReason?: string;
}

export interface ResourceOperationParams {
	readonly kind: ResourceKind;
	readonly id: string;
	readonly sourcePath?: string;
}

export interface ResourceManagementServiceOptions {
	readonly globalDir?: string;
	readonly projectDir?: string;
	readonly packageDir?: string;
}

const DIRS: Record<Exclude<ResourceKind, "package">, string> = {
	extension: "extensions",
	skill: "skills",
	"prompt-template": "prompts",
	theme: "themes",
};

export class ResourceManagementService {
	constructor(private readonly options: ResourceManagementServiceOptions = {}) {}

	list(): { resources: ManagedResource[]; diagnostics: string[] } {
		const diagnostics: string[] = [];
		const resources: ManagedResource[] = [];
		for (const source of ["global", "project"] as const) {
			const base = source === "global" ? this.options.globalDir : this.options.projectDir;
			if (!base) continue;
			for (const kind of Object.keys(DIRS) as Array<Exclude<ResourceKind, "package">>) {
				resources.push(...this.listDir(kind, source, join(base, DIRS[kind]), diagnostics));
			}
		}
		if (this.options.packageDir) resources.push(...this.listDir("package", "package", this.options.packageDir, diagnostics));
		return { resources: resources.sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`)), diagnostics };
	}

	reload(): { resources: ManagedResource[]; diagnostics: string[] } {
		return this.list();
	}

	install(params: ResourceOperationParams): ManagedResource {
		return this.resourceFor(params, "enabled");
	}

	update(params: ResourceOperationParams): ManagedResource {
		return this.resourceFor(params, "enabled");
	}

	remove(params: ResourceOperationParams): { ok: true } {
		const path = params.sourcePath ? resolve(params.sourcePath) : undefined;
		if (path && existsSync(path)) rmSync(path, { recursive: true, force: true });
		return { ok: true };
	}

	enable(params: ResourceOperationParams): ManagedResource {
		return this.resourceFor(params, "enabled");
	}

	disable(params: ResourceOperationParams): ManagedResource {
		return this.resourceFor(params, "disabled", "Disabled by GUI resource manager");
	}

	private listDir(kind: ResourceKind, source: ManagedResource["source"], dir: string, diagnostics: string[]): ManagedResource[] {
		if (!existsSync(dir)) return [];
		try {
			return readdirSync(dir).map((entry) => {
				const sourcePath = join(dir, entry);
				const disabled = entry.endsWith(".disabled");
				const id = entry.replace(/\.disabled$/, "").replace(/\.(md|json|ts|js|mjs|cjs|yaml|yml)$/, "");
				const entryDiagnostics: string[] = [];
				try { statSync(sourcePath); } catch (error) { entryDiagnostics.push(error instanceof Error ? error.message : String(error)); }
				return { id, name: id, kind, status: disabled ? "disabled" : entryDiagnostics.length ? "error" : "enabled", enabled: !disabled && entryDiagnostics.length === 0, source, sourcePath, diagnostics: entryDiagnostics, disabledReason: disabled ? "Disabled on disk" : undefined } satisfies ManagedResource;
			});
		} catch (error) {
			diagnostics.push(`${dir}: ${error instanceof Error ? error.message : String(error)}`);
			return [];
		}
	}

	private resourceFor(params: ResourceOperationParams, status: ResourceStatus, disabledReason?: string): ManagedResource {
		return { id: params.id, name: params.id, kind: params.kind, status, enabled: status === "enabled", source: "project", sourcePath: params.sourcePath, diagnostics: [], disabledReason };
	}
}
