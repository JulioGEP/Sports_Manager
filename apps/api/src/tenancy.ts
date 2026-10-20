import { isReservedSubdomain, subdomainFromHost } from "@sportsmanager/shared";
import type { ApiConfig } from "./config.ts";

export type HostClass =
  | { kind: "organization"; slug: string; source: "subdomain" | "fallback" }
  | { kind: "platform" }
  | { kind: "reserved"; label: string }
  | { kind: "unknown" };

/**
 * Etapa 1 de la cadena (ADR 0011 y 0016): el host decide el club. Función pura y testable,
 * compartida por la cadena HTTP y por los hooks de Better Auth (enlaces de los emails).
 * - Subdominio del dominio base: ese club. `admin` es la plataforma; el resto de reservados, nada.
 * - Host igual al dominio base, o deploy preview / branch deploy (sin subdominios posibles):
 *   el club de reserva si está configurado. Nunca sustituye a un subdominio real.
 */
export function classifyHost(
  host: string | undefined,
  config: ApiConfig,
  deployContext?: string,
): HostClass {
  const fallback = (): HostClass =>
    config.tenantFallbackSlug
      ? { kind: "organization", slug: config.tenantFallbackSlug, source: "fallback" }
      : { kind: "unknown" };

  if (deployContext === "deploy-preview" || deployContext === "branch-deploy") return fallback();

  const hostname = (host ?? "").split(":")[0]?.toLowerCase() ?? "";
  if (!hostname) return { kind: "unknown" };
  if (hostname === config.baseDomain) return fallback();
  if (config.isLocal && (hostname === "localhost" || hostname === "127.0.0.1")) return fallback();

  const label = subdomainFromHost(hostname, config.baseDomain);
  if (label === null) return { kind: "unknown" };
  if (label === "admin") return { kind: "platform" };
  if (isReservedSubdomain(label)) return { kind: "reserved", label };
  return { kind: "organization", slug: label, source: "subdomain" };
}

/**
 * Cabecera interna con el contexto de deploy de Netlify. La API la fija (o la borra) en cada
 * petición que entrega a Better Auth, para que sus hooks resuelvan el club del host igual que
 * la cadena de petición. Nunca se acepta del cliente.
 */
export const DEPLOY_CONTEXT_HEADER = "x-sm-deploy-context";

/**
 * Origen público (esquema y host) con el que se construyen los enlaces de los emails.
 * Solo se acepta un host que resuelva a un club o a la plataforma; cualquier otro cae al
 * dominio base. Así nadie puede envenenar un enlace de restablecer contraseña con un Host ajeno.
 */
export function publicOrigin(
  host: string | undefined,
  config: ApiConfig,
  deployContext?: string,
): string {
  const klass = classifyHost(host, config, deployContext);
  const scheme = config.isLocal ? "http" : "https";
  if (klass.kind === "organization" || klass.kind === "platform") {
    return `${scheme}://${(host ?? "").toLowerCase()}`;
  }
  return `${scheme}://${config.baseDomain}`;
}

/**
 * Dirección pública del espacio de un club: `https://<slug>.<dominio base>`. El club de reserva
 * (ADR 0016) vive en el dominio base a secas. En local conserva el puerto de la petición.
 * Hasta tener dominio propio con comodín, los subdominios solo resuelven en local (ADR 0021).
 */
export function organizationUrl(
  slug: string,
  config: ApiConfig,
  requestHost: string | undefined,
): string {
  const scheme = config.isLocal ? "http" : "https";
  const port = requestHost?.split(":")[1];
  const suffix = port ? `:${port}` : "";
  if (slug === config.tenantFallbackSlug) return `${scheme}://${config.baseDomain}${suffix}`;
  return `${scheme}://${slug}.${config.baseDomain}${suffix}`;
}
