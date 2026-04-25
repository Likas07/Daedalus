import type { OrchestrationProjection } from "@daedalus-pi/app-server-protocol";
import type { AppServerClient } from "./client";

export async function readOrchestrationProjection(client: AppServerClient): Promise<OrchestrationProjection> {
	return client.request("orchestration/read", {}) as Promise<OrchestrationProjection>;
}
