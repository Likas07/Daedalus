import type {
	RuntimeAbortParams,
	RuntimeCommandsParams,
	RuntimeCompactParams,
	RuntimeCycleModelParams,
	RuntimeCycleThinkingParams,
	RuntimeKeybindingsParams,
	RuntimeReloadResourcesParams,
	RuntimeSetModelParams,
	RuntimeSetQueueModeParams,
	RuntimeSetThinkingParams,
	RuntimeSetToolsParams,
	RuntimeStateParams,
} from "@daedalus-pi/app-server-protocol";
import type { AppServerClient, RequestResultMap } from "./client";

export class RuntimeControlClient {
	constructor(private readonly client: AppServerClient) {}

	getState(params: RuntimeStateParams): Promise<RequestResultMap["runtime/get-state"]> {
		return this.client.request("runtime/get-state", params);
	}
	setModel(params: RuntimeSetModelParams): Promise<RequestResultMap["runtime/set-model"]> {
		return this.client.request("runtime/set-model", params);
	}
	cycleModel(params: RuntimeCycleModelParams): Promise<RequestResultMap["runtime/cycle-model"]> {
		return this.client.request("runtime/cycle-model", params);
	}
	setThinking(params: RuntimeSetThinkingParams): Promise<RequestResultMap["runtime/set-thinking"]> {
		return this.client.request("runtime/set-thinking", params);
	}
	cycleThinking(params: RuntimeCycleThinkingParams): Promise<RequestResultMap["runtime/cycle-thinking"]> {
		return this.client.request("runtime/cycle-thinking", params);
	}
	setTools(params: RuntimeSetToolsParams): Promise<RequestResultMap["runtime/set-tools"]> {
		return this.client.request("runtime/set-tools", params);
	}
	setSteeringMode(params: RuntimeSetQueueModeParams): Promise<RequestResultMap["runtime/set-steering-mode"]> {
		return this.client.request("runtime/set-steering-mode", params);
	}
	setFollowUpMode(params: RuntimeSetQueueModeParams): Promise<RequestResultMap["runtime/set-follow-up-mode"]> {
		return this.client.request("runtime/set-follow-up-mode", params);
	}
	compact(params: RuntimeCompactParams): Promise<RequestResultMap["runtime/compact"]> {
		return this.client.request("runtime/compact", params);
	}
	abort(params: RuntimeAbortParams): Promise<RequestResultMap["runtime/abort"]> {
		return this.client.request("runtime/abort", params);
	}
	reloadResources(params: RuntimeReloadResourcesParams): Promise<RequestResultMap["runtime/reload-resources"]> {
		return this.client.request("runtime/reload-resources", params);
	}
	getCommands(params: RuntimeCommandsParams): Promise<RequestResultMap["runtime/get-commands"]> {
		return this.client.request("runtime/get-commands", params);
	}
	getKeybindings(params: RuntimeKeybindingsParams = {}): Promise<RequestResultMap["runtime/get-keybindings"]> {
		return this.client.request("runtime/get-keybindings", params);
	}
}
