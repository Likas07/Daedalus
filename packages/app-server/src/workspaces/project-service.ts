import { resolve } from "node:path";
import { type AppServerDatabase, appendEvent, type EventPayload } from "..";
import { projectRuntimeEvents } from "../persistence/projector";
import { listProjects, type ProjectReadModel } from "../persistence/read-model";
import type { RuntimeEventLog } from "../persistence/runtime-event-log";

export interface ProjectServiceOptions {
	readonly database: AppServerDatabase;
	readonly eventLog?: RuntimeEventLog;
}

export interface OpenProjectInput {
	readonly path: string;
	readonly name?: string;
	readonly projectId?: string;
}

export class ProjectService {
	constructor(private readonly options: ProjectServiceOptions) {}

	open(input: OpenProjectInput): { readonly projectId: string } {
		const normalizedPath = resolve(input.path);
		const existing = this.list().find((project) => resolve(project.path) === normalizedPath);
		if (existing) return { projectId: existing.id };

		const projectId = input.projectId ?? `project-${crypto.randomUUID()}`;
		if (input.projectId && this.get(input.projectId))
			throw new Error(`Project id already exists: ${input.projectId}`);
		const name = input.name ?? normalizedPath.split(/[\\/]/).at(-1) ?? normalizedPath;
		this.appendRuntimeEvent({
			streamId: `project:${projectId}`,
			type: "project/registered",
			payload: { projectId, path: normalizedPath, name } satisfies EventPayload,
		});
		return { projectId };
	}

	list(): ProjectReadModel[] {
		projectRuntimeEvents(this.options.database);
		return listProjects(this.options.database);
	}

	get(projectId: string): ProjectReadModel | undefined {
		return this.list().find((project) => project.id === projectId);
	}

	private appendRuntimeEvent(input: Parameters<typeof appendEvent>[1]): void {
		if (this.options.eventLog) {
			this.options.eventLog.append(input);
			return;
		}
		appendEvent(this.options.database, input);
		projectRuntimeEvents(this.options.database);
	}
}
