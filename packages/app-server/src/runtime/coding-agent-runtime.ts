import {
	createAgentSessionFromServices,
	createAgentSessionRuntime,
	createAgentSessionServices,
	getAgentDir,
	SessionManager,
	type CreateAgentSessionRuntimeFactory,
} from "@daedalus-pi/coding-agent";
import type { RuntimeFactory } from "./session-controller";
import { resolveRuntimeOptions } from "./runtime-options-resolver";
import type { AccessPolicyService } from "./access-policy-service";
import type { ApprovalService } from "./approval-service";
import { ToolApprovalGate } from "./tool-approval-gate";
import { ExtensionUIBridge } from "../extensions/extension-ui-bridge";
import type { ExtensionUiRouter } from "../extensions/extension-ui-router";

export interface CodingAgentRuntimeFactoryOptions {
	readonly approvalService?: ApprovalService;
	readonly accessPolicy?: AccessPolicyService;
	readonly approvalTimeoutMs?: number;
	readonly extensionUiRouter?: ExtensionUiRouter;
}

export function createCodingAgentRuntimeFactory(options: CodingAgentRuntimeFactoryOptions = {}): RuntimeFactory {
	return async ({ cwd, agentDir, sessionManager, applyProcessCwd, context, sessionId }) => {
		const resolvedAgentDir = agentDir || getAgentDir();
		let currentServices: Awaited<ReturnType<typeof createAgentSessionServices>> | undefined;
		const applyOptions = async (session: unknown, nextContext = context) => {
			if (!currentServices) return;
			const resolved = await resolveRuntimeOptions({ services: currentServices, sessionManager, context: nextContext });
			currentServices.diagnostics.push(...resolved.diagnostics);
			const agentSession = session as { agent?: { state?: { model?: unknown; thinkingLevel?: unknown } }; setActiveTools?: (tools: unknown[]) => void };
			if (resolved.model && agentSession.agent?.state) agentSession.agent.state.model = resolved.model;
			if (resolved.thinkingLevel && agentSession.agent?.state) agentSession.agent.state.thinkingLevel = resolved.thinkingLevel;
			agentSession.setActiveTools?.(resolved.tools ?? []);
		};
		const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd: runtimeCwd, sessionManager, sessionStartEvent }) => {
			const services = await createAgentSessionServices({ cwd: runtimeCwd, agentDir: resolvedAgentDir });
			currentServices = services;
			const resolved = await resolveRuntimeOptions({ services, sessionManager, context });
			services.diagnostics.push(...resolved.diagnostics);
			const session = await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, model: resolved.model, thinkingLevel: resolved.thinkingLevel, scopedModels: resolved.scopedModels, tools: resolved.tools });
			if (options.extensionUiRouter && sessionId) {
				await session.session.bindExtensions({
					uiContext: new ExtensionUIBridge({
						extensionId: "app-server",
						sessionId,
						router: options.extensionUiRouter,
						emit: () => {},
					}) as never,
				});
			}
			if (options.approvalService && options.accessPolicy && sessionId) installApprovalGate(session.session, new ToolApprovalGate({ sessionId, approvalService: options.approvalService, accessPolicy: options.accessPolicy, timeoutMs: options.approvalTimeoutMs }));
			return { ...session, services, diagnostics: services.diagnostics };
		};
		const runtime = await createAgentSessionRuntime(createRuntime, {
			cwd,
			agentDir: resolvedAgentDir,
			sessionManager: (sessionManager ?? SessionManager.create(cwd)) as SessionManager,
			applyProcessCwd: applyProcessCwd ?? false,
		});
		return {
			cwd: runtime.cwd,
			session: runtime.session,
			applyRuntimeOptions: (nextContext?: typeof context) => applyOptions(runtime.session, nextContext),
			control: {
				reload: async () => {
					await runtime.session.reload?.();
				},
				get diagnostics() {
					return runtime.diagnostics;
				},
			},
			dispose: async () => {
				(runtime.session as { __approvalGate?: ToolApprovalGate }).__approvalGate?.dispose();
				if (sessionId) options.extensionUiRouter?.cancelSession(sessionId, "Session disposed");
				await runtime.dispose();
			},
		};
	};
}

function installApprovalGate(session: unknown, gate: ToolApprovalGate): void {
	const agentSession = session as { __approvalGate?: ToolApprovalGate; agent?: { beforeToolCall?: (context: any, signal?: AbortSignal) => Promise<unknown> | unknown } };
	agentSession.__approvalGate?.dispose("Approval gate replaced.");
	agentSession.__approvalGate = gate;
	const previous = agentSession.agent?.beforeToolCall;
	if (!agentSession.agent) return;
	agentSession.agent.beforeToolCall = async (context: any, signal?: AbortSignal) => {
		const existing = await previous?.(context, signal);
		if (existing && typeof existing === "object" && (existing as { block?: unknown }).block === true) return existing;
		return gate.beforeToolCall({ toolName: context.toolCall.name, toolCallId: context.toolCall.id, args: context.args, signal });
	};
}
