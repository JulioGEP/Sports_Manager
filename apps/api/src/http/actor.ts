import {
  effectivePermissions,
  PLATFORM_SUPPORT_PERMISSIONS,
  SUPPORT_GRANT_PERMISSIONS,
  VIEW_AS_HEADER,
  type AccessScope,
  type Permission,
} from "@sportsmanager/shared";
import type { Context, MiddlewareHandler } from "hono";
import type { DataLayer, OrgScope } from "../data/index.ts";
import type { Actor, AppEnv, SessionUser } from "./context.ts";
import { forbidden, notFound } from "./errors.ts";
import { shared } from "./memo.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Etapa 3 de la cadena: la pertenencia autoriza y fija los roles. Sin pertenencia: 403.
 * Un administrador de plataforma sin pertenencia entra en modo soporte (ADR 0017):
 * solo agregados; con autorización vigente del club, lectura completa.
 *
 * "Ver como" (Bloque 14, ADR 0031): con `org.view_as`, la cabecera `x-sm-view-as` con el id de
 * otra persona del club convierte al actor en esa persona (sus roles, su cargo, sus equipos, su
 * familia). Una cabecera que no apunta a un miembro del club se ignora. La sesión no cambia.
 *
 * Los permisos son los del rol y el cargo con las reglas de acceso del club aplicadas
 * (Bloque 19, ADR 0033): lo que la administración incluye o excluye por perfil y por persona.
 */
export function requireActor(data: DataLayer): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // Varias cadenas pueden cubrir la misma ruta: el actor se resuelve una vez.
    if (c.get("actor")) return next();
    const tenant = c.get("tenant");
    if (tenant?.kind !== "organization") throw notFound();
    const user = c.get("sessionUser");
    const viewAs = c.req.header(VIEW_AS_HEADER)?.trim() ?? "";
    const actor = await shared(c, `actor:${tenant.scope.organizationId}:${user.id}:${viewAs}`, () =>
      actorOf(data, tenant.scope, user, viewAs),
    );
    if (!actor) throw forbidden("No perteneces a este club.");
    c.set("actor", actor);
    return next();
  };
}

/** Quién actúa en el club, o null si no pertenece a él ni es soporte de plataforma. */
async function actorOf(
  data: DataLayer,
  scope: OrgScope,
  user: SessionUser,
  viewAs: string,
): Promise<Actor | null> {
  const [memberships, rules] = await Promise.all([
    data.memberships.membershipsFor(scope, user.id),
    data.access.rulesFor(scope, user.id),
  ]);
  if (memberships.length > 0) {
    const own = effectivePermissions(memberships, rules);
    if (own.has("org.view_as") && UUID.test(viewAs) && viewAs !== user.id) {
      const [target, targetMemberships, targetRules] = await Promise.all([
        data.users.byId(viewAs),
        data.memberships.membershipsFor(scope, viewAs),
        data.access.rulesFor(scope, viewAs),
      ]);
      if (target && targetMemberships.length > 0) {
        const roles = targetMemberships.map((m) => m.roleCode);
        const permissions = effectivePermissions(targetMemberships, targetRules);
        permissions.delete("org.view_as");
        return {
          kind: "member",
          userId: target.id,
          roles,
          position: targetMemberships.find((m) => m.roleCode === "staff")?.position ?? null,
          memberships: targetMemberships,
          permissions,
          viewingAs: { userId: target.id, name: target.name, roles },
          // Quien mira sigue siendo la administración: puede cambiar de persona sin salir.
          canViewAs: true,
        };
      }
    }
    return {
      kind: "member",
      userId: user.id,
      roles: memberships.map((m) => m.roleCode),
      position: memberships.find((m) => m.roleCode === "staff")?.position ?? null,
      memberships,
      permissions: own,
      viewingAs: null,
      canViewAs: own.has("org.view_as"),
    };
  }
  if (await data.platform.isPlatformAdmin(user)) {
    const hasGrant = await data.platform.hasActiveSupportGrant(scope, user.id);
    return {
      kind: "platform_support",
      userId: user.id,
      hasGrant,
      permissions: new Set(hasGrant ? SUPPORT_GRANT_PERMISSIONS : PLATFORM_SUPPORT_PERMISSIONS),
    };
  }
  return null;
}

/**
 * Ámbito del actor (Bloque 19, ADR 0033): qué secciones, equipos y deportistas ve. Se resuelve
 * una vez por petición; el soporte de plataforma no ve datos personales, así que su ámbito da igual.
 */
export async function accessScopeOf(data: DataLayer, c: Context<AppEnv>): Promise<AccessScope> {
  const cached = c.get("accessScope");
  if (cached) return cached;
  const actor = c.get("actor");
  const tenant = c.get("tenant");
  const scope: AccessScope =
    actor.kind === "member" && tenant.kind === "organization"
      ? await shared(c, `scope:${tenant.scope.organizationId}:${actor.userId}`, () =>
          data.access.scopeFor(tenant.scope, actor.userId, actor.memberships),
        )
      : { kind: "club" };
  c.set("accessScope", scope);
  return scope;
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
