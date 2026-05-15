import type { V1RouteHandler } from "./router";

export function createTimelineV1RouteHandler(): V1RouteHandler {
	return {
		canHandle: () => false,
		handle: async (request) => {
			throw new Error(`Unsupported timeline v1 request: ${String((request as { method?: unknown }).method)}`);
		},
	};
}
