import {
  permissionsForMemberships,
  PLATFORM_SUPPORT_PERMISSIONS,
  SUPPORT_GRANT_PERMISSIONS,
  VIEW_AS_HEADER,
  type Permission,
} from "@sportsmanager/shared";
import type { MiddlewareHandler } from "hono";
import type { DataLayer } from "../data/index.ts";
import type { AppEnv } from "./context.ts";
import { forbidden, notFound } from "./errors.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Etapa 3 de la cadena: la pertenencia autoriza y fija los roles. Sin pertenencia: 403.
 * Un administrador de plataforma sin pertenencia entra en modo soporte (ADR 0017):
 * solo agregados; con autorización vigente del club, lectura completa.
 *
 * "Ver como" (Bloque 14, ADR 0031): con `org.view_as`, la cabecera `x-sm-view-as` con el id de
 * otra persona del club convierte al actor en esa persona (sus roles, su cargo, sus equipos, su
 * familia). Una cabecera que no apunta a un miembro del club se ignora. La sesión no cambia.
 */
export function requireActor(data: DataLayer): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const tenant = c.get("tenant");
    if (tenant?.kind !== "organization") throw notFound();
    const user = c.get("sessionUser");
    const memberships = await data.memberships.membershipsFor(tenant.scope, user.id);
    if (memberships.length > 0) {
      const own = permissionsForMemberships(memberships);
      const viewAs = c.req.header(VIEW_AS_HEADER)?.trim() ?? "";
      if (own.has("org.view_as") && UUID.test(viewAs) && viewAs !== user.id) {
        const [target, targetMemberships] = await Promise.all([
          data.users.byId(viewAs),
          data.memberships.membershipsFor(tenant.scope, viewAs),
        ]);
        if (target && targetMemberships.length > 0) {
          const roles = targetMemberships.map((m) => m.roleCode);
          const permissions = permissionsForMemberships(targetMemberships);
          permissions.delete("org.view_as");
          c.set("actor", {
            kind: "member",
            userId: target.id,
            roles,
            position: targetMemberships.find((m) => m.roleCode === "staff")?.position ?? null,
            permissions,
            viewingAs: { userId: target.id, name: target.name, roles },
            // Quien mira sigue siendo la administración: puede cambiar de persona sin salir.
            canViewAs: true,
          });
          return next();
        }
      }
      c.set("actor", {
        kind: "member",
        userId: user.id,
        roles: memberships.map((m) => m.roleCode),
        position: memberships.find((m) => m.roleCode === "staff")?.position ?? null,
        permissions: own,
        viewingAs: null,
        canViewAs: own.has("org.view_as"),
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
