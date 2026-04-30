import { type Static, Type } from "@sinclair/typebox";

export const appServerProtocolVersion = "0.1.0" as const;

export const ProtocolVersionSchema = Type.Literal(appServerProtocolVersion);
export type ProtocolVersion = Static<typeof ProtocolVersionSchema>;

export const RequestIdSchema = Type.Union([Type.String({ minLength: 1 }), Type.Number()]);
export type RequestId = Static<typeof RequestIdSchema>;

export const ProjectIdSchema = Type.String({ minLength: 1 });
export type ProjectId = Static<typeof ProjectIdSchema>;

export const WorktreeIdSchema = Type.String({ minLength: 1 });
export type WorktreeId = Static<typeof WorktreeIdSchema>;

export const ThreadIdSchema = Type.String({ minLength: 1 });
export type ThreadId = Static<typeof ThreadIdSchema>;

export const WorkspaceTargetIdSchema = Type.String({ minLength: 1 });
export type WorkspaceTargetId = Static<typeof WorkspaceTargetIdSchema>;

export const SessionIdSchema = Type.String({ minLength: 1 });
export type SessionId = Static<typeof SessionIdSchema>;

export const TurnIdSchema = Type.String({ minLength: 1 });
export type TurnId = Static<typeof TurnIdSchema>;

export const ApprovalIdSchema = Type.String({ minLength: 1 });
export type ApprovalId = Static<typeof ApprovalIdSchema>;

export const ExtensionIdSchema = Type.String({ minLength: 1 });
export type ExtensionId = Static<typeof ExtensionIdSchema>;

export const ExtensionUiRequestIdSchema = Type.String({ minLength: 1 });
export type ExtensionUiRequestId = Static<typeof ExtensionUiRequestIdSchema>;

export const CheckpointIdSchema = Type.String({ minLength: 1 });
export type CheckpointId = Static<typeof CheckpointIdSchema>;

export const DiffIdSchema = Type.String({ minLength: 1 });
export type DiffId = Static<typeof DiffIdSchema>;

export const TerminalIdSchema = Type.String({ minLength: 1 });
export type TerminalId = Static<typeof TerminalIdSchema>;

export const EventIdSchema = Type.String({ minLength: 1 });
export type EventId = Static<typeof EventIdSchema>;
