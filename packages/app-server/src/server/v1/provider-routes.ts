import type { V1Request, V1RouteHandler } from "./router";

export function createProviderV1RouteHandler(): V1RouteHandler {
	return {
		canHandle: (method) => method === "provider.snapshot",
		handle: async (request, context) => {
			const method = (request as V1Request).method;
			if (method !== "provider.snapshot") throw new Error(`Unsupported provider v1 method: ${method}`);
			if (!context.providerSnapshot) throw new Error("Provider snapshot route is not configured");
			return context.providerSnapshot();
		},
	};
}
