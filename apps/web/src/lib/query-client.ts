import { QueryClient } from "@tanstack/react-query";
import { ApiClientError } from "./api";

/**
 * Caché de la web (ADR 0060). Lo leído vale 30 s: volver a una pantalla la pinta al momento, sin
 * esperar a la red, y pasado ese tiempo se refresca por detrás mientras se ve lo que había. Cada
 * cambio invalida lo suyo, así que lo propio se ve siempre al día. Lo que deja de verse se guarda
 * 10 minutos para volver atrás sin esperas.
 *
 * Un 4xx no se reintenta: un 403 o un 404 no van a cambiar en un segundo, y el reintento solo
 * retrasaba el aviso. Un fallo de red o un 5xx, una vez.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failures, error) =>
        failures < 1 &&
        !(error instanceof ApiClientError && error.status >= 400 && error.status < 500),
    },
  },
});
