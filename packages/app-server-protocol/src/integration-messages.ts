import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { ProjectIdSchema } from "./ids";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const IntegrationProviderSchema = Type.String({ minLength: 1 });
export type IntegrationProvider = Static<typeof IntegrationProviderSchema>;

export const IntegrationStatusSchema = Type.Union([
	Type.Literal("unknown"),
	Type.Literal("available"),
	Type.Literal("authenticated"),
	Type.Literal("unauthenticated"),
	Type.Literal("not-configured"),
	Type.Literal("error"),
]);
export type IntegrationStatus = Static<typeof IntegrationStatusSchema>;

export const IntegrationRepositoryBindingSchema = StrictObject({
	provider: IntegrationProviderSchema,
	owner: Type.String({ minLength: 1 }),
	name: Type.String({ minLength: 1 }),
	remoteUrl: Type.Optional(Type.String()),
	projectId: Type.Optional(ProjectIdSchema),
});
export type IntegrationRepositoryBinding = Static<typeof IntegrationRepositoryBindingSchema>;

export const IntegrationIssueSchema = StrictObject({
	id: Type.String({ minLength: 1 }),
	number: Type.Optional(Type.Integer({ minimum: 0 })),
	title: Type.Optional(Type.String()),
	url: Type.Optional(Type.String()),
	state: Type.Optional(Type.String()),
	labels: Type.Optional(Type.Array(Type.String())),
});
export type IntegrationIssue = Static<typeof IntegrationIssueSchema>;

export const IntegrationCiCheckSchema = StrictObject({
	name: Type.String({ minLength: 1 }),
	status: Type.Union([
		Type.Literal("queued"),
		Type.Literal("in_progress"),
		Type.Literal("success"),
		Type.Literal("failure"),
		Type.Literal("cancelled"),
		Type.Literal("unknown"),
	]),
	url: Type.Optional(Type.String()),
	summary: Type.Optional(Type.String()),
});
export type IntegrationCiCheck = Static<typeof IntegrationCiCheckSchema>;

export const IntegrationPullRequestSchema = StrictObject({
	number: Type.Integer({ minimum: 0 }),
	title: Type.Optional(Type.String()),
	url: Type.Optional(Type.String()),
	state: Type.Optional(Type.String()),
	head: Type.Optional(Type.String()),
	base: Type.Optional(Type.String()),
	createUpdateGuarded: Type.Optional(Type.Boolean()),
	checks: Type.Optional(Type.Array(IntegrationCiCheckSchema)),
});
export type IntegrationPullRequest = Static<typeof IntegrationPullRequestSchema>;

export const IntegrationSyncErrorSchema = StrictObject({
	provider: Type.Optional(IntegrationProviderSchema),
	message: Type.String(),
	code: Type.Optional(Type.String()),
	retryable: Type.Optional(Type.Boolean()),
	occurredAt: Type.String({ minLength: 1 }),
});
export type IntegrationSyncError = Static<typeof IntegrationSyncErrorSchema>;

export const IntegrationProviderStateSchema = StrictObject({
	provider: IntegrationProviderSchema,
	status: IntegrationStatusSchema,
	repository: Type.Optional(IntegrationRepositoryBindingSchema),
	issues: Type.Array(IntegrationIssueSchema),
	pullRequests: Type.Array(IntegrationPullRequestSchema),
	ciChecks: Type.Array(IntegrationCiCheckSchema),
	syncErrors: Type.Optional(Type.Array(IntegrationSyncErrorSchema)),
	message: Type.Optional(Type.String()),
	updatedAt: Type.String({ minLength: 1 }),
});
export type IntegrationProviderState = Static<typeof IntegrationProviderStateSchema>;

export const IntegrationListResultSchema = StrictObject({ integrations: Type.Array(IntegrationProviderStateSchema) });
export type IntegrationListResult = Static<typeof IntegrationListResultSchema>;

export const IntegrationConnectParamsSchema = StrictObject({
	provider: IntegrationProviderSchema,
	projectId: Type.Optional(ProjectIdSchema),
	config: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
export type IntegrationConnectParams = Static<typeof IntegrationConnectParamsSchema>;

export const IntegrationDisconnectParamsSchema = StrictObject({
	provider: IntegrationProviderSchema,
	projectId: Type.Optional(ProjectIdSchema),
});
export type IntegrationDisconnectParams = Static<typeof IntegrationDisconnectParamsSchema>;

export const IntegrationManualLinkParamsSchema = StrictObject({
	provider: IntegrationProviderSchema,
	projectId: Type.Optional(ProjectIdSchema),
	url: Type.String({ minLength: 1 }),
	kind: Type.Optional(
		Type.Union([
			Type.Literal("issue"),
			Type.Literal("pull-request"),
			Type.Literal("repository"),
			Type.Literal("link"),
			Type.String(),
		]),
	),
});
export type IntegrationManualLinkParams = Static<typeof IntegrationManualLinkParamsSchema>;

export const IntegrationImportParamsSchema = StrictObject({
	provider: IntegrationProviderSchema,
	projectId: Type.Optional(ProjectIdSchema),
	source: Type.String({ minLength: 1 }),
});
export type IntegrationImportParams = Static<typeof IntegrationImportParamsSchema>;

export const IntegrationPullRequestCreateParamsSchema = StrictObject({
	provider: IntegrationProviderSchema,
	projectId: Type.Optional(ProjectIdSchema),
	title: Type.String({ minLength: 1 }),
	body: Type.Optional(Type.String()),
	head: Type.String({ minLength: 1 }),
	base: Type.Optional(Type.String()),
	draft: Type.Optional(Type.Boolean()),
});
export type IntegrationPullRequestCreateParams = Static<typeof IntegrationPullRequestCreateParamsSchema>;

export const PullRequestCreateResultSchema = StrictObject({
	number: Type.Optional(Type.Integer({ minimum: 0 })),
	url: Type.Optional(Type.String()),
	status: Type.Union([Type.Literal("requested"), Type.Literal("created"), Type.Literal("failed")]),
	message: Type.Optional(Type.String()),
});
export type PullRequestCreateResult = Static<typeof PullRequestCreateResultSchema>;

export const IntegrationConnectResultSchema = StrictObject({ integration: IntegrationProviderStateSchema });
export type IntegrationConnectResult = Static<typeof IntegrationConnectResultSchema>;

export const IntegrationDisconnectResultSchema = StrictObject({
	integrations: Type.Array(IntegrationProviderStateSchema),
});
export type IntegrationDisconnectResult = Static<typeof IntegrationDisconnectResultSchema>;

export const IntegrationPullRequestCreateResultSchema = StrictObject({ pullRequest: PullRequestCreateResultSchema });
export type IntegrationPullRequestCreateResult = Static<typeof IntegrationPullRequestCreateResultSchema>;
