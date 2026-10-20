import {
  permissionsForRoles,
  PLATFORM_SUPPORT_PERMISSIONS,
  SUPPORT_GRANT_PERMISSIONS,
  type Permission,
} from "@sportsmanager/shared";
import type { MiddlewareHandler } from "hono";
import type { DataLayer } from "../data/index.ts";
import type { AppEnv } from "./context.ts";
import { forbidden, notFound } from "./errors.ts";

/**
 * Etapa 3 de la cadena: la pertenencia autoriza y fija los roles. Sin pertenencia: 403.
 * Un administrador de plataforma sin pertenencia entra en modo soporte (ADR 0017):
 * solo agregados; con autorización vigente del club, lectura completa.
 */
export function requireActor(data: DataLayer): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const tenant = c.get("tenant");
    if (tenant?.kind !== "organization") throw notFound();
    const user = c.get("sessionUser");
    const roles = await data.memberships.rolesFor(tenant.scope, user.id);
    if (roles.length > 0) {
      c.set("actor", {
        kind: "member",
        userId: user.id,
        roles,
        permissions: permissionsForRoles(roles),
      });
      return next();
    }
    if (await data.platform.isPlatformAdmin(user)) {
      const hasGrant = await data.platform.hasActiveSupportGrant(tenant.scope, user.id);
      c.set("actor", {
        kind: "platform_support",
        userId: user.id,
        hasGrant,
        permissions: new Set(hasGrant ? SUPPORT_GRANT_PERMISSIONS : PLATFORM_SUPPORT_PERMISSIONS),
      });
      return next();
    }
    throw forbidden("No perteneces a este club.");
  };
}

/** Comprueba un permiso, nunca un nombre de rol. */
export function requirePermission(permission: Permission): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!c.get("actor")?.permissions.has(permission)) throw forbidden();
    await next();
  };
}

/** Admin interno (ADR 0022): solo administradores de plataforma, en cualquier host. */
export function requirePlatformAdmin(data: DataLayer): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("sessionUser");
    if (!(await data.platform.isPlatformAdmin(user))) throw forbidden();
    await next();
  };
}
