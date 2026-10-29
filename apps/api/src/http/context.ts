import type {
  AccessScope,
  Locale,
  MembershipRole,
  Permission,
  RoleCode,
  StaffPosition,
} from "@sportsmanager/shared";
import type { OrganizationRow, OrgScope } from "../data/index.ts";
import type { BatchMemo } from "./memo.ts";

/** Contexto que Netlify pasa a la función. En tests puede no existir. */
export interface NetlifyContext {
  server?: { region?: string };
  deploy?: { context?: string; id?: string };
  /** Deja trabajo en marcha tras responder (Netlify Functions). Sin él, se espera a que acabe. */
  waitUntil?: (promise: Promise<unknown>) => void;
}

export interface NetlifyEnv {
  context?: NetlifyContext;
  /** Solo dentro de `POST /api/batch` (ADR 0060): lo que las peticiones del lote resuelven una vez. */
  memo?: BatchMemo;
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
      /**
       * Quién actúa dentro del club. Con "ver como" (Bloque 14) es la persona observada: los
       * permisos y lo "propio" (equipos, familia) son los suyos. La sesión (`sessionUser`) sigue
       * siendo la de quien de verdad está dentro, y es quien queda en la auditoría.
       */
      userId: string;
      roles: RoleCode[];
      /** Cargo del personal (Bloque 13), si tiene el rol `staff`. */
      position: StaffPosition | null;
      /** Las pertenencias con su cargo (Bloque 19): de ellas sale el ámbito. */
      memberships: MembershipRole[];
      permissions: ReadonlySet<Permission>;
      viewingAs: { userId: string; name: string; roles: RoleCode[] } | null;
      canViewAs: boolean;
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
  /**
   * Búsqueda de la sesión ya en marcha (ADR 0060): la arranca la resolución del club para que las
   * dos consultas vayan a la vez, y la recogen `requireSession` y `optionalSession`.
   */
  sessionLookup: Promise<SessionUser | null>;
  actor: Actor;
  /** Ámbito del actor (Bloque 19), resuelto una vez por petición cuando una ruta lo pide. */
  accessScope: AccessScope | undefined;
}

export type AppEnv = { Bindings: NetlifyEnv; Variables: AppVariables };
