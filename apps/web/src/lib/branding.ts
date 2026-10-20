import { OrganizationBrandingSchema, type OrganizationBranding } from "@sportsmanager/shared";
import { headers } from "next/headers";
import { cache } from "react";

function isLocalHost(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|[^/]+\.localhost)(:\d+)?$/i.test(host);
}

/**
 * Marca del club del host, pedida a la API en el servidor en cada petición (Bloque 5).
 * La web no interpreta el host: se lo pasa a la API, que decide el club con su cadena de
 * siempre. Sin club (dominio base sin reserva, host desconocido, API caída): null.
 * `cache` de React evita repetir la llamada dentro de la misma petición.
 */
export const getBranding = cache(async (): Promise<OrganizationBranding | null> => {
  const incoming = await headers();
  const host = incoming.get("host");
  if (!host) return null;
  const scheme = isLocalHost(host) ? "http" : "https";
  try {
    const res = await fetch(`${scheme}://${host}/api/org/branding`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return OrganizationBrandingSchema.parse(await res.json());
  } catch (error) {
    console.error("[web] no se pudo leer la marca del club", error);
    return null;
  }
});
