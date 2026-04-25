import type { AuditQuery, AuditTrailProjection, AutomationProjection } from "@daedalus-pi/app-server-protocol";
import type { AppServerClient } from "./client";

export async function queryAuditTrail(client: AppServerClient, query: AuditQuery = {}): Promise<AuditTrailProjection> {
	return client.request("audit/query", {
		...query,
		kinds: query.kinds ? [...query.kinds] : undefined,
	}) as Promise<AuditTrailProjection>;
}
export async function readAutomationProjection(client: AppServerClient): Promise<AutomationProjection> {
	return client.request("automation/read", {}) as Promise<AutomationProjection>;
}
