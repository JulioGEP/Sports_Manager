import type { Locale, Permission, RoleCode, StaffPosition } from "@sportsmanager/shared";
import type { OrganizationRow, OrgScope } from "../data/index.ts";

/** Contexto que Netlify pasa a la función. En tests puede no existir. */
export interface NetlifyContext {
  server?: { region?: string };
  deploy?: { context?: string; id?: string };
}

export interface NetlifyEnv {
  context?: NetlifyContext;
}

/** Resultado de la etapa 1 de la cadena: qué dice el host. */
export type Tenant =
  { kind: "organization"; organization: OrganizationRow; scope: OrgScope } | { kind: "platform" };

/** Resultado de la etapa 2: quién tiene la sesión. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  locale: Locale | null;
}

/** Resultado de la etapa 3: qué puede hacer dentro del club del host. */
export type Actor =
  | {
      kind: "member";
      userId: string;
      roles: RoleCode[];
      /** Cargo del personal (Bloque 13), si tiene el rol `staff`. */
      position: StaffPosition | null;
      permissions: ReadonlySet<Permission>;
    }
  | {
      kind: "platform_support";
      userId: string;
      hasGrant: boolean;
      permissions: ReadonlySet<Permission>;
    };

export interface AppVariables {
  tenant: Tenant;
  sessionUser: SessionUser;
  /** Sesión si la hay, en rutas que funcionan con y sin ella (aceptar invitación). */
  optionalSessionUser: SessionUser | null;
  actor: Actor;
}

export type AppEnv = { Bindings: NetlifyEnv; Variables: AppVariables };
