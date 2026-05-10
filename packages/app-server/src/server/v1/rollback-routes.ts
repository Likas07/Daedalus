import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { V1Request, V1RouteHandler } from "./router";

export function createRollbackV1RouteHandler(): V1RouteHandler {
	return {
		canHandle: (method) => method === "thread.rollback",
		handle: async (request, context) => {
			const v1Request = request as V1Request;
			if (v1Request.method !== "thread.rollback")
				throw new Error(`Unsupported rollback v1 method: ${v1Request.method}`);
			if (!context.rollbackThread) throw new Error("Thread rollback route is not configured");
			return context.rollbackThread(v1Request.params as protocolV1.ThreadRollbackParams);
		},
	};
}
