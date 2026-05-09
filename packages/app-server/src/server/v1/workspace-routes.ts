import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { V1RouteHandler } from "./router";

const WORKSPACE_METHODS = new Set(["workspaceTarget.list", "workspaceTarget.validate"]);

export function createWorkspaceV1RouteHandler(): V1RouteHandler {
	return {
		canHandle: (method) => WORKSPACE_METHODS.has(method),
		handle: async (request, context) => {
			const { method, params } = asRequest(request);
			if (!context.workspaceTargets) throw new Error("Workspace target v1 routes are not configured");
			switch (method) {
				case "workspaceTarget.list":
					return context.workspaceTargets.list(asWorkspaceTargetListParams(params));
				case "workspaceTarget.validate":
					return context.workspaceTargets.validate(asWorkspaceTargetValidateParams(params));
				default:
					throw new Error(`Unsupported workspace v1 request: ${String(method)}`);
			}
		},
	};
}

function asRequest(value: unknown): { method: string; params: unknown } {
	if (!value || typeof value !== "object") throw new Error("Invalid workspace v1 request");
	return value as { method: string; params: unknown };
}

function asWorkspaceTargetListParams(value: unknown): protocolV1.WorkspaceTargetListParams {
	const params = asRecord(value);
	return { projectId: requiredString(params, "projectId") };
}

function asWorkspaceTargetValidateParams(value: unknown): protocolV1.WorkspaceTargetValidateParams {
	const params = asRecord(value);
	return { workspaceTargetId: requiredString(params, "workspaceTargetId") };
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function requiredString(params: Readonly<Record<string, unknown>>, key: string): string {
	const value = params[key];
	if (typeof value !== "string" || value.length === 0) throw new Error(`Missing required v1 parameter: ${key}`);
	return value;
}
