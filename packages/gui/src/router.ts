import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, type RouterHistory } from "@tanstack/react-router";
import { createElement } from "react";
import { routeTree } from "./routeTree.gen";
import { AppAtomRegistryProvider } from "./rpc/atomRegistry";

export function getRouter(history: RouterHistory) {
	const queryClient = new QueryClient();

	return createRouter({
		routeTree,
		history,
		context: {
			queryClient,
		},
		Wrap: ({ children }) =>
			createElement(
				QueryClientProvider,
				{ client: queryClient },
				createElement(AppAtomRegistryProvider, undefined, children),
			),
	});
}

export type AppRouter = ReturnType<typeof getRouter>;

declare module "@tanstack/react-router" {
	interface Register {
		router: AppRouter;
	}
}
