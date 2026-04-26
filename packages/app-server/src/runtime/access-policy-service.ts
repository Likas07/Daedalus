import type { AccessMode } from "@daedalus-pi/app-server-protocol";
import { type AppServerDatabase, appendEvent, type EventPayload } from "..";
import { projectRuntimeEvents } from "../persistence/projector";
import { GuiConfigService } from "./gui-config-service";

export interface AccessPolicy {
	readonly mode: AccessMode;
	readonly autoApproveSoftPrompts: boolean;
	readonly bypassHardBlocks: false;
	readonly auditRequired: true;
}

export class AccessPolicyService {
	private readonly config: GuiConfigService;

	constructor(private readonly database: AppServerDatabase) {
		this.config = new GuiConfigService(database);
	}

	getPolicy(): AccessPolicy {
		return toPolicy(this.config.getValue<unknown>("access.mode", "supervised"));
	}

	setMode(mode: AccessMode): AccessPolicy {
		const policy = toPolicy(mode);
		this.config.set("access.mode", policy.mode);
		appendEvent(this.database, {
			streamId: "app",
			type: "access/changed",
			payload: { type: "access/changed", mode: policy.mode, policy: policy as unknown as EventPayload, ts: new Date().toISOString() } satisfies EventPayload,
		});
		projectRuntimeEvents(this.database);
		return policy;
	}

	auditAutoApproved(approvalId: string): void {
		appendEvent(this.database, {
			streamId: "app",
			type: "access/auto-approved",
			payload: { type: "access/auto-approved", approvalId, mode: "unrestricted", ts: new Date().toISOString() } satisfies EventPayload,
		});
	}
}

export function toPolicy(mode: unknown): AccessPolicy {
	const selected: AccessMode = mode === "auto-accept" || mode === "unrestricted" ? mode : "supervised";
	return {
		mode: selected,
		autoApproveSoftPrompts: selected !== "supervised",
		bypassHardBlocks: false,
		auditRequired: true,
	};
}
