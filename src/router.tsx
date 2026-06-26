import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Per-request client (evita vazar cache entre requisições no SSR).
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Reduz refetches agressivos em navegação/foco.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Query controla o frescor; Router só dispara o preload.
    defaultPreloadStaleTime: 0,
    // Pré-carrega chunks + loaders ao passar o mouse / focar links.
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
  });

  return router;
};
