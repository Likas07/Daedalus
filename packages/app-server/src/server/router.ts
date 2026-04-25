import type {
	AppEvent,
	AuditQuery,
	ClientRequest,
	ServerNotification,
	ServerRequest,
} from "@daedalus-pi/app-server-protocol";
import { type AppServerDatabase, appendEvent, type EventPayload, readEventsAfter } from "..";
import type { CommandRunner } from "../integrations/integration-api";
import { IntegrationService } from "../integrations/integration-service";
import { projectRuntimeEvents } from "../persistence/projector";
import { listProjectSessions } from "../persistence/read-model";
import { projectAuditTrail } from "../runtime/audit-projection";
import { AutomationService } from "../runtime/automation-service";
import { projectOrchestration } from "../runtime/orchestration-projection";
import type { SessionController } from "../runtime/session-controller";
import { TerminalService } from "../terminal/terminal-service";
import { ProjectService } from "../workspaces/project-service";
import { WorktreeService } from "../workspaces/worktree-service";
import { createDiagnosticExport } from "./diagnostics";

export type OutboundMessage = AppEvent | ServerNotification | ServerRequest;
export type Publish = (message: OutboundMessage) => void;

export interface AppRouterOptions {
	readonly database: AppServerDatabase;
	readonly controller: SessionController;
	readonly publish: Publish;
	readonly integrationRunner?: CommandRunner;
}

export class AppRouter {
	private readonly projects = new Map<string, string>();
	private readonly projectService: ProjectService;
	private readonly worktreeService: WorktreeService;
	private readonly terminalService: TerminalService;
	private readonly integrationService: IntegrationService;
	private readonly automationService = new AutomationService();
	constructor(private readonly options: AppRouterOptions) {
		this.projectService = new ProjectService({ database: options.database });
		this.worktreeService = new WorktreeService({ database: options.database });
		this.terminalService = new TerminalService({ publish: options.publish });
		this.integrationService = new IntegrationService({
			database: options.database,
			runner: options.integrationRunner,
		});
	}

	async handle(request: ClientRequest): Promise<unknown> {
		switch (request.method) {
			case "initialize":
				return {
					protocolVersion: request.params.protocolVersion,
					server: { name: "daedalus-app-server", version: "0.1.0" },
					capabilities: { events: true, sessions: true, extensions: true },
				};
			case "project/open": {
				const result = this.projectService.open({ path: request.params.path });
				this.projects.set(result.projectId, request.params.path);
				return result;
			}
			case "project/list":
				return { projects: this.projectService.list() };
			case "worktree/list":
				return { worktrees: this.worktreeService.list(request.params.projectId) };
			case "worktree/create":
				return { worktree: await this.worktreeService.create(request.params) };
			case "session/list":
				projectRuntimeEvents(this.options.database);
				return {
					sessions: request.params.projectId
						? listProjectSessions(this.options.database, request.params.projectId)
						: this.options.controller.readState().sessions,
				};
			case "session/start": {
				const cwd = this.projects.get(request.params.projectId) ?? request.params.projectId;
				return this.options.controller.startSession({ cwd, prompt: request.params.prompt });
			}
			case "turn/start":
				return this.options.controller.startTurn(request.params);
			case "turn/cancel":
				await this.options.controller.interruptTurn(request.params);
				return {};
			case "session/stop":
				await this.options.controller.disposeSession(request.params.sessionId);
				return {};
			case "terminal/create":
				return { terminal: this.terminalService.create(request.params) };
			case "terminal/list":
				return { terminals: this.terminalService.list(request.params) };
			case "terminal/attach":
				return { terminal: this.terminalService.attach(request.params.terminalId) };
			case "terminal/detach":
				return { terminal: this.terminalService.detach(request.params.terminalId) };
			case "terminal/input":
				this.terminalService.input(request.params.terminalId, request.params.data);
				return {};
			case "terminal/resize":
				return {
					terminal: this.terminalService.resize(request.params.terminalId, {
						cols: request.params.cols,
						rows: request.params.rows,
					}),
				};
			case "terminal/kill":
				return { terminal: this.terminalService.kill(request.params.terminalId) };
			case "terminal/replay":
				return this.terminalService.replay(request.params.terminalId, request.params.afterSeq);
			case "integration/list": {
				const cwd =
					request.params && "projectId" in request.params
						? this.projects.get(String(request.params.projectId))
						: undefined;
				return { integrations: await this.integrationService.list({ cwd }) };
			}
			case "integration/connect": {
				const state = await this.integrationService.connect({ provider: request.params.provider });
				this.options.publish({
					kind: "notification",
					method: "integration/changed",
					params: { provider: state.provider, status: state.status },
				});
				return { integration: state };
			}
			case "integration/disconnect":
				return { integrations: await this.integrationService.disconnect({ provider: request.params.provider }) };
			case "integration/link":
				return { integration: await this.integrationService.linkArtifact(request.params) };
			case "integration/import":
				return { integration: await this.integrationService.importArtifacts(request.params) };
			case "diagnostics/export":
				return { export: createDiagnosticExport(this.options.database, request.params) };
			case "orchestration/read":
				return projectOrchestration(this.recentAppEvents());
			case "audit/query":
				return projectAuditTrail(this.recentAppEvents(), request.params as AuditQuery);
			case "automation/read":
				return this.automationService.readProjection();
			case "event/replay": {
				const after = Number(request.params.cursor?.after ?? 0);
				const limit = request.params.cursor?.limit ?? 1000;
				const stored = readEventsAfter(this.options.database, Number.isFinite(after) ? after : 0, { limit });
				const events = stored
					.map((event) => event.payload as unknown as AppEvent)
					.filter((event) => !request.params.types || request.params.types.includes(event.type));
				return { events, next: events.length ? { after: String(stored.at(-1)?.seq ?? after) } : undefined };
			}
			default:
				return {};
		}
	}

	private recentAppEvents(limit = 1000): AppEvent[] {
		return readEventsAfter(this.options.database, 0, { limit })
			.map((event) => event.payload as unknown as AppEvent)
			.filter((event): event is AppEvent => typeof event === "object" && event !== null && "type" in event);
	}

	append(event: AppEvent): void {
		const stored = appendEvent(this.options.database, {
			streamId: event.sessionId ?? "app",
			type: event.type,
			payload: event as unknown as EventPayload,
		});
		projectRuntimeEvents(this.options.database);
		this.options.publish({
			kind: "notification",
			method: "event/appended",
			params: { event: { ...event, seq: stored.seq } },
		});
	}
}
