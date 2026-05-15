import {
	type AppServerErrorCode,
	type ClientNotification,
	ClientNotificationSchema,
	type ClientRequest,
	ClientRequestSchema,
	type ProtocolV1ClientRequest,
	ProtocolV1ClientRequestSchema,
	type ProtocolV1Phase3ClientRequest,
	ProtocolV1Phase3ClientRequestSchema,
} from "@daedalus-pi/app-server-protocol";
import { Value } from "@sinclair/typebox/value";

export interface ProtocolValidationError {
	readonly code: AppServerErrorCode;
	readonly message: string;
	readonly data?: unknown;
}

export type ValidatedInboundMessage =
	| {
			readonly kind: "request";
			readonly request: ClientRequest | ProtocolV1ClientRequest | ProtocolV1Phase3ClientRequest;
	  }
	| { readonly kind: "notification"; readonly notification: ClientNotification };

export function validateInboundMessage(message: unknown): ValidatedInboundMessage | ProtocolValidationError {
	if (!message || typeof message !== "object" || Array.isArray(message)) {
		return { code: "invalid_request", message: "App-server message must be an object" };
	}
	const kind = (message as { readonly kind?: unknown }).kind;
	if (kind === "notification") return validateClientNotification(message);
	if (kind !== "request")
		return { code: "invalid_request", message: "App-server message kind must be request or notification" };
	return validateClientRequest(message);
}

export function isInitializeRequest(message: unknown): boolean {
	return (
		!!message &&
		typeof message === "object" &&
		(message as { readonly kind?: unknown }).kind === "request" &&
		(message as { readonly method?: unknown }).method === "initialize"
	);
}

export function validationFailed(
	value: ValidatedInboundMessage | ProtocolValidationError,
): value is ProtocolValidationError {
	return "code" in value;
}

function validateClientRequest(message: unknown): ValidatedInboundMessage | ProtocolValidationError {
	const envelopeError = validateRequestEnvelope(message);
	if (envelopeError) return envelopeError;
	const method = (message as { readonly method: string }).method;
	if (!knownRequestMethods().has(method)) {
		return { code: "method_not_found", message: `Unsupported app-server method: ${method}` };
	}
	if (Value.Check(ClientRequestSchema, message)) {
		return { kind: "request", request: message as ClientRequest };
	}
	if (Value.Check(ProtocolV1ClientRequestSchema, message)) {
		return { kind: "request", request: message as ProtocolV1ClientRequest };
	}
	if (Value.Check(ProtocolV1Phase3ClientRequestSchema, message)) {
		if (method === "v1.approval.answer" && !hasApprovalAnswer(message)) {
			return { code: "invalid_params", message: "v1.approval.answer requires answer or answers" };
		}
		return { kind: "request", request: message as ProtocolV1Phase3ClientRequest };
	}
	return {
		code: "invalid_params",
		message: `Invalid params for ${method}`,
		data: { errors: schemaErrorsForRequest(message) },
	};
}

function hasApprovalAnswer(message: unknown): boolean {
	const params = (message as { params?: unknown }).params;
	if (!params || typeof params !== "object") return false;
	const record = params as { answer?: unknown; answers?: unknown };
	return (
		(typeof record.answer === "string" && record.answer.length > 0) ||
		!!(record.answers && typeof record.answers === "object" && !Array.isArray(record.answers))
	);
}

function knownRequestMethods(): Set<string> {
	return new Set<string>([
		"initialize",
		"project/list",
		"project/open",
		"worktree/list",
		"worktree/create",
		"worktree/cleanup-scan",
		"worktree/cleanup",
		"workspace/selection/get",
		"workspace/selection/set",
		"workflow/target/validate",
		"session/start",
		"session/continue-in-worktree",
		"session/stop",
		"session/list",
		"session/import-jsonl",
		"session/export-jsonl",
		"session/export-html",
		"session/resume",
		"session/fork",
		"session/rename",
		"session/archive",
		"session/delete",
		"session/stats",
		"session/tree",
		"turn/start",
		"turn/cancel",
		"runtime/get-state",
		"runtime/set-model",
		"runtime/cycle-model",
		"runtime/set-thinking",
		"runtime/cycle-thinking",
		"runtime/set-tools",
		"runtime/set-steering-mode",
		"runtime/set-follow-up-mode",
		"runtime/compact",
		"runtime/abort",
		"runtime/reload-resources",
		"runtime/get-commands",
		"runtime/get-keybindings",
		"settings/read",
		"settings/set",
		"settings/reset",
		"settings/reload-resources",
		"resources/list",
		"resources/reload",
		"resources/install",
		"resources/remove",
		"resources/update",
		"resources/enable",
		"resources/disable",
		"approval/list",
		"approval/respond",
		"extension/ui/respond",
		"checkpoint/list",
		"checkpoint/create",
		"checkpoint/restore",
		"diff/get",
		"git/stage",
		"git/unstage",
		"git/discard",
		"git/commit",
		"git/checkpoint-restore",
		"composer/file-search",
		"composer/command-list",
		"composer/attachment/save",
		"composer/attachment/get",
		"terminal/create",
		"terminal/list",
		"terminal/attach",
		"terminal/detach",
		"terminal/input",
		"terminal/resize",
		"terminal/kill",
		"terminal/replay",
		"config/get",
		"config/set",
		"model/list",
		"model/select",
		"auth/status",
		"auth/login",
		"auth/logout",
		"access/get",
		"access/set",
		"integration/list",
		"integration/connect",
		"integration/disconnect",
		"integration/link",
		"integration/import",
		"integration/pr-create",
		"integration/pr-open",
		"diagnostics/export",
		"orchestration/read",
		"daedalus/workflow/read",
		"audit/query",
		"automation/read",
		"shell/snapshot",
		"thread/snapshot",
		"event/replay",
		"provider.snapshot",
		"workspaceTarget.list",
		"workspaceTarget.validate",
		"thread.create",
		"thread.list",
		"thread.get",
		"thread.resume",
		"thread.replay",
		"thread.rollback",
		"turn.start",
		"turn.cancel",
		"payload.window",
		"text.threadTitle",
		"text.branchName",
		"text.commitMessage",
		"text.prContent",
		"v1.approval.list",
		"v1.approval.decide",
		"v1.approval.answer",
		"v1.diff.summary",
		"v1.diff.fileWindow",
		"v1.terminal.open",
		"v1.terminal.input",
		"v1.terminal.resize",
		"v1.terminal.close",
		"v1.terminal.replay",
	]);
}

function validateClientNotification(message: unknown): ValidatedInboundMessage | ProtocolValidationError {
	if (Value.Check(ClientNotificationSchema, message)) {
		return { kind: "notification", notification: message as ClientNotification };
	}
	return {
		code: "invalid_request",
		message: "Invalid client notification",
		data: { errors: schemaErrors(ClientNotificationSchema, message) },
	};
}

function validateRequestEnvelope(message: unknown): ProtocolValidationError | undefined {
	const envelope = message as { readonly id?: unknown; readonly method?: unknown; readonly params?: unknown };
	if (typeof envelope.id !== "string" || envelope.id.length === 0) {
		return { code: "invalid_request", message: "Request id must be a non-empty string" };
	}
	if (typeof envelope.method !== "string" || envelope.method.length === 0) {
		return { code: "invalid_request", message: "Request method must be a non-empty string" };
	}
	if (!("params" in (message as Record<string, unknown>))) {
		return { code: "invalid_request", message: "Request params are required" };
	}
	return undefined;
}

function schemaErrorsForRequest(message: unknown): unknown[] {
	const root = schemaErrors(ClientRequestSchema, message);
	if (root.length > 0) return root;
	const v1 = schemaErrors(ProtocolV1ClientRequestSchema, message);
	if (v1.length > 0) return v1;
	return schemaErrors(ProtocolV1Phase3ClientRequestSchema, message);
}

function schemaErrors(schema: Parameters<typeof Value.Errors>[0], value: unknown): unknown[] {
	return [...Value.Errors(schema, value)].map((error) => ({
		path: error.path,
		message: error.message,
		value: error.value,
	}));
}
