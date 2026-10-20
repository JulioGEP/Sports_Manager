import {
  isReservedSubdomain,
  ORGANIZATION_SLUG_PATTERN,
  subdomainFromHost,
} from "@sportsmanager/shared";
import type { ApiConfig } from "./config.ts";

export type HostClass =
  | { kind: "organization"; slug: string; source: "subdomain" | "path" | "fallback" }
  | { kind: "platform" }
  | { kind: "reserved"; label: string }
  | { kind: "unknown" };

/**
 * Señal del club cuando los clubes viven en una ruta del dominio base (ADR 0027): la web
 * manda el slug en esta cabecera en cada petición del club. Para recursos que el navegador
 * pide sin cabeceras (el logo en un `<img>`), el mismo slug viaja en la query `club`.
 */
export const CLUB_HEADER = "x-sm-club";
export const CLUB_QUERY = "club";

export interface RequestSignals {
  host: string | undefined;
  /** Valor de `x-sm-club` o de `?club=`, tal cual llega. */
  club?: string | null | undefined;
}

/**
 * Etapa 1 de la cadena con las dos señales: el subdominio manda si lo hay (dominio propio con
 * comodín); si no, el slug de la ruta que la web declara. Un slug mal formado o reservado no
 * resuelve nada. Sin ninguna señal, vale lo que diga el host (club de reserva o nada).
 */
export function classifyRequest(
  signals: RequestSignals,
  config: ApiConfig,
  deployContext?: string,
): HostClass {
  const byHost = classifyHost(signals.host, config, deployContext);
  if (byHost.kind === "organization" && byHost.source === "subdomain") return byHost;
  if (byHost.kind === "platform" || byHost.kind === "reserved") return byHost;
  const club = signals.club?.trim().toLowerCase();
  if (club) {
    if (!ORGANIZATION_SLUG_PATTERN.test(club) || isReservedSubdomain(club)) {
      return { kind: "unknown" };
    }
    return { kind: "organization", slug: club, source: "path" };
  }
  return byHost;
}

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
  const scheme = config.isLocal ? "http" : "https";
  const normalized = (host ?? "").toLowerCase();
  const hostname = normalized.split(":")[0] ?? "";
  const trusted =
    hostname === config.baseDomain ||
    (config.isLocal && (hostname === "localhost" || hostname === "127.0.0.1")) ||
    deployContext === "deploy-preview" ||
    deployContext === "branch-deploy";
  if (trusted && hostname) return `${scheme}://${normalized}`;
  const klass = classifyHost(host, config, deployContext);
  if (klass.kind === "organization" || klass.kind === "platform") {
    return `${scheme}://${normalized}`;
  }
  return `${scheme}://${config.baseDomain}`;
}

/**
 * Dirección pública del espacio de un club.
 * - `path` (ADR 0027, hasta tener dominio con comodín): `https://<dominio base>/<slug>`, sobre el
 *   mismo origen desde el que se pide (deploy previews y local incluidos).
 * - `subdomain`: `https://<slug>.<dominio base>`; el club de reserva (ADR 0016) vive en el dominio
 *   base a secas. En local conserva el puerto de la petición.
 */
export function organizationUrl(
  slug: string,
  config: ApiConfig,
  requestHost: string | undefined,
  deployContext?: string,
): string {
  if (config.tenantRouting === "path") {
    return `${publicOrigin(requestHost, config, deployContext)}/${slug}`;
  }
  const scheme = config.isLocal ? "http" : "https";
  const port = requestHost?.split(":")[1];
  const suffix = port ? `:${port}` : "";
  if (slug === config.tenantFallbackSlug) return `${scheme}://${config.baseDomain}${suffix}`;
  return `${scheme}://${slug}.${config.baseDomain}${suffix}`;
}

/** URL absoluta de un recurso de la API (por ejemplo el logo) desde el origen de la petición. */
export function absoluteApiUrl(
  relativePath: string,
  config: ApiConfig,
  requestHost: string | undefined,
  deployContext?: string,
): string {
  return `${publicOrigin(requestHost, config, deployContext)}${relativePath}`;
}
