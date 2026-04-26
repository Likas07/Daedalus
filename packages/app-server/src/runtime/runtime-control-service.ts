import type { AgentSessionRuntimeDiagnostic } from "@daedalus-pi/coding-agent";
import type { RuntimeCommand, RuntimeKeybinding, RuntimeQueueMode, RuntimeState, SessionId } from "@daedalus-pi/app-server-protocol";
import type { ControlledSessionRuntime, SessionController } from "./session-controller";

type AnySession = Record<string, any>;

export class RuntimeControlService {
	constructor(private readonly controller: SessionController) {}

	getState(sessionId: SessionId): RuntimeState {
		const session = this.session(sessionId);
		return {
			model: session.model,
			thinkingLevel: session.thinkingLevel,
			isStreaming: Boolean(session.isStreaming),
			isCompacting: Boolean(session.isCompacting),
			steeringMode: session.steeringMode ?? "all",
			followUpMode: session.followUpMode ?? "all",
			sessionFile: session.sessionFile,
			sessionId: session.sessionId,
			sessionName: session.sessionName,
			autoCompactionEnabled: session.autoCompactionEnabled,
			messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
			pendingMessageCount: Number(session.pendingMessageCount ?? 0),
		};
	}

	async setModel(sessionId: SessionId, provider: string, modelId: string): Promise<{ model: unknown }> {
		const session = this.session(sessionId);
		const models = await session.modelRegistry?.getAvailable?.();
		const model = models?.find((candidate: { provider: string; id: string }) => candidate.provider === provider && candidate.id === modelId);
		if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);
		await session.setModel?.(model);
		await this.changed(sessionId, "model", { model });
		return { model };
	}

	async cycleModel(sessionId: SessionId): Promise<{ result: unknown }> {
		const result = await this.session(sessionId).cycleModel?.();
		await this.changed(sessionId, "model", { result });
		return { result: result ?? null };
	}

	async setThinking(sessionId: SessionId, level: string): Promise<{ level: string }> {
		this.session(sessionId).setThinkingLevel?.(level);
		await this.changed(sessionId, "thinking", { level });
		return { level };
	}

	async cycleThinking(sessionId: SessionId): Promise<{ level: string | null }> {
		const level = this.session(sessionId).cycleThinkingLevel?.() ?? null;
		await this.changed(sessionId, "thinking", { level });
		return { level };
	}

	async setTools(sessionId: SessionId, tools: readonly string[]): Promise<{ tools: readonly string[] }> {
		const session = this.session(sessionId);
		const available = session.tools ?? session.services?.tools ?? [];
		const selected = Array.isArray(available) ? available.filter((tool: { name?: string }) => tools.includes(String(tool.name))) : [];
		session.setActiveTools?.(selected);
		await this.changed(sessionId, "tools", { tools });
		return { tools };
	}

	async setSteeringMode(sessionId: SessionId, mode: RuntimeQueueMode): Promise<{ mode: RuntimeQueueMode }> {
		this.session(sessionId).setSteeringMode?.(mode);
		await this.changed(sessionId, "steeringMode", { mode });
		return { mode };
	}

	async setFollowUpMode(sessionId: SessionId, mode: RuntimeQueueMode): Promise<{ mode: RuntimeQueueMode }> {
		this.session(sessionId).setFollowUpMode?.(mode);
		await this.changed(sessionId, "followUpMode", { mode });
		return { mode };
	}

	async compact(sessionId: SessionId, customInstructions?: string): Promise<{ result: unknown }> {
		const result = await this.session(sessionId).compact?.(customInstructions);
		await this.changed(sessionId, "compact", { result });
		return { result };
	}

	async abort(sessionId: SessionId): Promise<Record<string, never>> {
		await this.controller.getSessionRuntime(sessionId).session.abort();
		await this.changed(sessionId, "abort", {});
		return {};
	}

	async reloadResources(sessionId: SessionId): Promise<{ diagnostics: readonly AgentSessionRuntimeDiagnostic[] }> {
		const runtime = this.controller.getSessionRuntime(sessionId) as ControlledSessionRuntime & { control?: { reload?: () => Promise<void>; diagnostics?: readonly AgentSessionRuntimeDiagnostic[] } };
		await (runtime.control?.reload?.() ?? this.session(sessionId).reload?.());
		const diagnostics = runtime.control?.diagnostics ?? this.session(sessionId).diagnostics ?? [];
		await this.changed(sessionId, "reloadResources", { diagnostics });
		return { diagnostics };
	}

	getCommands(sessionId: SessionId): { commands: readonly RuntimeCommand[] } {
		const session = this.session(sessionId);
		const commands: RuntimeCommand[] = [];
		for (const command of session.extensionRunner?.getRegisteredCommands?.() ?? []) commands.push({ name: command.invocationName, description: command.description, source: "extension", sourceInfo: command.sourceInfo });
		for (const template of session.promptTemplates ?? []) commands.push({ name: template.name, description: template.description, source: "prompt", sourceInfo: template.sourceInfo });
		for (const skill of session.resourceLoader?.getSkills?.().skills ?? []) commands.push({ name: `skill:${skill.name}`, description: skill.description, source: "skill", sourceInfo: skill.sourceInfo });
		return { commands };
	}

	getKeybindings(): { keybindings: readonly RuntimeKeybinding[] } {
		return {
			keybindings: [
				{ action: "app.interrupt", keys: ["escape"] },
				{ action: "app.model.cycleForward", keys: ["ctrl+m"] },
				{ action: "app.thinking.cycle", keys: ["ctrl+t"] },
			],
		};
	}

	private session(sessionId: SessionId): AnySession {
		return this.controller.getSessionRuntime(sessionId).session as AnySession;
	}

	private changed(sessionId: SessionId, control: string, payload: unknown): Promise<void> {
		return this.controller.emitRuntimeControlChanged(sessionId, control, payload);
	}
}
