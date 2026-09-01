import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RouteSpinner } from "./components/RouteSpinner";
import { rewriteInput, rewriteOutput } from "./lib/url-rewrite";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 30,
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 200,
    defaultPendingMinMs: 100,
    defaultPendingComponent: RouteSpinner,
    // Clean URLs on the apex domain: /alerts, /billing, /admin/*, etc.
    // The internal route tree still lives at /dashboard/* for the dashboard section.
    rewrite: {
      input: ({ url }) => rewriteInput(url),
      output: ({ url }) => rewriteOutput(url),
    },
  });

  return router;
};



