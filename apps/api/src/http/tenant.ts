import { isReservedSubdomain, subdomainFromHost } from "@sportsmanager/shared";
import type { MiddlewareHandler } from "hono";
import type { ApiConfig } from "../config.ts";
import type { DataLayer } from "../data/index.ts";
import type { AppEnv } from "./context.ts";
import { forbidden, notFound } from "./errors.ts";

export type HostClass =
  | { kind: "organization"; slug: string; source: "subdomain" | "fallback" }
  | { kind: "platform" }
  | { kind: "reserved"; label: string }
  | { kind: "unknown" };

/**
 * Etapa 1 de la cadena (ADR 0011 y 0016): el host decide el club. Función pura y testable.
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

/** Resuelve el club del host y lo deja en el contexto. Sin club ni plataforma: 404. */
export function resolveTenant(config: ApiConfig, data: DataLayer): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const klass = classifyHost(c.req.header("host"), config, c.env?.context?.deploy?.context);
    if (klass.kind === "platform") {
      c.set("tenant", { kind: "platform" });
      return next();
    }
    if (klass.kind !== "organization") throw notFound("Este host no corresponde a ningún club.");
    const resolved = await data.organizations.findBySlug(klass.slug);
    if (!resolved) throw notFound("Este host no corresponde a ningún club.");
    if (resolved.organization.status !== "active") throw forbidden("Este club no está activo.");
    c.set("tenant", {
      kind: "organization",
      organization: resolved.organization,
      scope: resolved.scope,
    });
    await next();
  };
}

export const requireOrganizationHost: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("tenant")?.kind !== "organization")
    throw notFound("Este host no corresponde a ningún club.");
  await next();
};

export const requirePlatformHost: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("tenant")?.kind !== "platform") throw notFound();
  await next();
};
