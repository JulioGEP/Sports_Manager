import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  AcceptInvitationBodySchema,
  AcceptInvitationResponseSchema,
  ApiErrorSchema,
  InvitationCreateSchema,
  InvitationSchema,
  InvitationSentResponseSchema,
  InvitationsResponseSchema,
  playerDisplayName,
  PublicInvitationSchema,
  type Locale,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import { invitationState, isUniqueViolation, type DataLayer } from "../data/index.ts";
import { requireActor, requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import {
  badRequest,
  conflict,
  invitationEmailMismatch,
  invitationExpired,
  notFound,
  unauthorized,
} from "../http/errors.ts";
import { optionalSession, requireSession } from "../http/session.ts";
import { requireOrganizationHost, resolveTenant } from "../http/tenant.ts";
import { invitationDto, sendInvitationEmail } from "../services/invitations.ts";
import { organizationUrl } from "../tenancy.ts";

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiErrorSchema } },
});
const orgErrors = {
  401: error("Sin sesión"),
  403: error("Sin pertenencia o sin permiso"),
  404: error("Host sin club o invitación inexistente"),
};

/** Rutas de invitaciones (ADR 0019): gestión desde el club y aceptación pública por token. */
export function createInvitationRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();

  // --- Gestión desde el club: cadena completa y permiso org.members.invite ---
  const orgChain = [
    resolveTenant(config, data),
    requireOrganizationHost,
    requireSession(data),
    requireActor(data),
    requirePermission("org.members.invite"),
  ] as const;
  app.use("/api/org/invitations", ...orgChain);
  app.use("/api/org/invitations/*", ...orgChain);

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/invitations",
      tags: ["Invitaciones"],
      summary: "Invitaciones del club, las más recientes primero",
      security: [{ sessionCookie: [] }],
      responses: {
        200: {
          description: "Invitaciones",
          content: { "application/json": { schema: InvitationsResponseSchema } },
        },
        ...orgErrors,
      },
    }),
    async (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      const invitations = await data.invitations.list(tenant.scope);
      return c.json({ invitations: invitations.map(invitationDto) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/invitations",
      tags: ["Invitaciones"],
      summary: "Invita a alguien al club con un rol y le envía el email",
      security: [{ sessionCookie: [] }],
      request: {
        body: {
          content: { "application/json": { schema: InvitationCreateSchema } },
          required: true,
        },
      },
      responses: {
        201: {
          description: "Invitación creada",
          content: { "application/json": { schema: InvitationSentResponseSchema } },
        },
        409: error("Ya es miembro con ese rol o ya tiene una invitación pendiente"),
        ...orgErrors,
      },
    }),
    async (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      const user = c.get("sessionUser");
      const body = c.req.valid("json");
      const locale = body.locale ?? (tenant.organization.defaultLocale as Locale);

      const existing = await data.users.findByEmail(body.email);
      if (existing) {
        const roles = await data.memberships.rolesFor(tenant.scope, existing.id);
        if (roles.includes(body.roleCode))
          throw conflict("Esa persona ya es miembro del club con ese rol.");
      }
      if (body.roleCode === "staff" && !body.position)
        throw badRequest("El personal del club entra con un cargo.");
      if (body.teamId && !(await data.teams.byId(tenant.scope, body.teamId)))
        throw badRequest("Ese equipo no es de este club.");

      let result;
      try {
        result = await data.invitations.create(tenant.scope, {
          email: body.email,
          roleCode: body.roleCode,
          locale,
          invitedBy: user.id,
          ttlDays: config.invitationTtlDays,
          position: body.position ?? null,
          teamId: body.teamId ?? null,
        });
      } catch (err) {
        if (isUniqueViolation(err)) result = { outcome: "pending_exists" as const };
        else throw err;
      }
      if (result.outcome === "pending_exists")
        throw conflict("Ya hay una invitación pendiente para ese email. Reenvíala o revócala.");

      const sent = await sendInvitationEmail(config, data, {
        organization: tenant.organization,
        issued: result,
        inviterName: user.name,
        origin: organizationUrl(
          tenant.organization.slug,
          config,
          c.req.header("host"),
          c.env?.context?.deploy?.context,
        ),
      });
      await data.audit.record({
        actorUserId: user.id,
        organizationId: tenant.organization.id,
        action: "invitation.created",
        target: body.email,
        details: {
          roleCode: body.roleCode,
          locale,
          position: body.position ?? null,
          teamId: body.teamId ?? null,
        },
      });
      return c.json(sent, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/invitations/{id}/resend",
      tags: ["Invitaciones"],
      summary: "Reenvía una invitación pendiente con un enlace nuevo. El anterior deja de valer",
      security: [{ sessionCookie: [] }],
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: {
        200: {
          description: "Invitación reenviada",
          content: { "application/json": { schema: InvitationSentResponseSchema } },
        },
        ...orgErrors,
      },
    }),
    async (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      const user = c.get("sessionUser");
      const { id } = c.req.valid("param");
      const issued = await data.invitations.rotate(tenant.scope, id, config.invitationTtlDays);
      if (!issued) throw notFound("No hay ninguna invitación pendiente con ese identificador.");
      const sent = await sendInvitationEmail(config, data, {
        organization: tenant.organization,
        issued,
        inviterName: user.name,
        origin: organizationUrl(
          tenant.organization.slug,
          config,
          c.req.header("host"),
          c.env?.context?.deploy?.context,
        ),
      });
      await data.audit.record({
        actorUserId: user.id,
        organizationId: tenant.organization.id,
        action: "invitation.resent",
        target: issued.invitation.email,
      });
      return c.json(sent, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/invitations/{id}",
      tags: ["Invitaciones"],
      summary: "Revoca una invitación pendiente",
      security: [{ sessionCookie: [] }],
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: {
        200: {
          description: "Invitación revocada",
          content: { "application/json": { schema: z.object({ invitation: InvitationSchema }) } },
        },
        ...orgErrors,
      },
    }),
    async (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      const { id } = c.req.valid("param");
      const revoked = await data.invitations.revoke(tenant.scope, id);
      if (!revoked) throw notFound("No hay ninguna invitación pendiente con ese identificador.");
      await data.audit.record({
        actorUserId: c.get("sessionUser").id,
        organizationId: tenant.organization.id,
        action: "invitation.revoked",
        target: revoked.email,
      });
      return c.json({ invitation: invitationDto(revoked) }, 200);
    },
  );

  // --- Aceptación pública: el token identifica la invitación; el host debe ser su club ---
  const publicChain = [
    resolveTenant(config, data),
    requireOrganizationHost,
    optionalSession(data),
  ] as const;
  app.use("/api/invitations/*", ...publicChain);

  const tokenParam = z.object({ token: z.string().min(1).max(128) });

  async function findForHost(
    c: { get: (key: "tenant") => AppEnv["Variables"]["tenant"] },
    token: string,
  ) {
    const tenant = c.get("tenant");
    if (tenant.kind !== "organization") throw notFound();
    const found = await data.invitations.findByToken(token);
    if (!found || found.organization.id !== tenant.organization.id)
      throw notFound("Esta invitación no existe o no es de este club.");
    const state = invitationState(found.invitation.status, found.invitation.expiresAt);
    if (state === "revoked") throw notFound("Esta invitación ya no es válida.");
    return { tenant, found, state };
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/invitations/{token}",
      tags: ["Invitaciones"],
      summary: "Qué invita y a quién, para la pantalla de aceptación. Sin sesión",
      request: { params: tokenParam },
      responses: {
        200: {
          description: "Invitación",
          content: { "application/json": { schema: PublicInvitationSchema } },
        },
        404: error("Token inexistente, revocado o de otro club"),
      },
    }),
    async (c) => {
      const { token } = c.req.valid("param");
      const { found, state } = await findForHost(c, token);
      const org = found.organization;
      const hasAccount = (await data.users.findByEmail(found.invitation.email)) !== null;
      return c.json(
        {
          organization: {
            slug: org.slug,
            name: org.name,
            brandPrimaryColor: org.brandPrimaryColor,
            brandSecondaryColor: org.brandSecondaryColor,
          },
          email: found.invitation.email,
          roleCode: found.invitation.roleCode,
          roleName: found.roleName,
          locale: found.invitation.locale,
          state,
          expiresAt: found.invitation.expiresAt.toISOString(),
          hasAccount,
          playerName: found.invitation.player ? playerDisplayName(found.invitation.player) : null,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/invitations/{token}/accept",
      tags: ["Invitaciones"],
      summary:
        "Acepta la invitación. Sin cuenta: crea la cuenta con nombre y contraseña e inicia sesión. Con cuenta: exige la sesión de ese email y añade el rol",
      request: {
        params: tokenParam,
        body: {
          content: { "application/json": { schema: AcceptInvitationBodySchema } },
          required: false,
        },
      },
      responses: {
        200: {
          description: "Pertenencia creada o ampliada",
          content: { "application/json": { schema: AcceptInvitationResponseSchema } },
        },
        400: error("Faltan nombre o contraseña para crear la cuenta"),
        401: error("Ese email ya tiene cuenta: hay que iniciar sesión para aceptar"),
        403: error("La sesión es de otra persona"),
        404: error("Token inexistente, revocado o de otro club"),
        409: error("Ya aceptada"),
        410: error("Caducada"),
      },
    }),
    async (c) => {
      const { token } = c.req.valid("param");
      const { tenant, found, state } = await findForHost(c, token);
      if (state === "expired") throw invitationExpired();
      if (state === "accepted") throw conflict("Esta invitación ya se ha aceptado.");
      const invitation = found.invitation;
      const session = c.get("optionalSessionUser");
      const existing = await data.users.findByEmail(invitation.email);
      const organization = { slug: tenant.organization.slug, name: tenant.organization.name };

      /** Cuerpo técnico (Bloque 13): quien entra con equipo queda en su cuerpo técnico. */
      const joinTeam = async (userId: string) => {
        if (!invitation.team) return;
        const outcome = await data.teams.addStaff(tenant.scope, invitation.team.id, userId);
        if (outcome === "added") {
          await data.audit.record({
            actorUserId: userId,
            organizationId: tenant.organization.id,
            action: "team.staff_added",
            target: invitation.team.name,
            details: { userId, via: "invitation" },
          });
        }
      };

      /**
       * Invitación de familia (Bloque 11): la cuenta queda vinculada al jugador al aceptar. La del
       * propio deportista (ADR 0046) pasa además a ser la cuenta de su ficha.
       */
      const linkFamily = async (userId: string) => {
        if (!invitation.player || !invitation.relationship) return;
        if (invitation.roleCode === "athlete") {
          const outcome = await data.players.linkAthlete(
            tenant.scope,
            invitation.player.id,
            userId,
          );
          if (outcome !== "linked") {
            console.error("[invitations] el deportista no se pudo vincular a su ficha", outcome);
            return;
          }
          await data.audit.record({
            actorUserId: userId,
            organizationId: tenant.organization.id,
            action: "player.athlete_linked",
            target: playerDisplayName(invitation.player),
            details: { via: "invitation" },
          });
          return;
        }
        await data.players.linkGuardian(
          tenant.scope,
          invitation.player.id,
          userId,
          invitation.relationship,
        );
        await data.audit.record({
          actorUserId: userId,
          organizationId: tenant.organization.id,
          action: "player.guardian_linked",
          target: playerDisplayName(invitation.player),
          details: { relationship: invitation.relationship, via: "invitation" },
        });
      };

      if (existing) {
        if (!session)
          throw unauthorized(
            "Ese email ya tiene cuenta. Inicia sesión para aceptar la invitación.",
          );
        if (session.id !== existing.id) throw invitationEmailMismatch();
        const roles = await data.memberships.join(
          tenant.scope,
          existing.id,
          invitation.roleCode,
          invitation.position,
        );
        await data.invitations.markAccepted(tenant.scope, invitation.id, existing.id);
        await linkFamily(existing.id);
        await joinTeam(existing.id);
        await data.audit.record({
          actorUserId: existing.id,
          organizationId: tenant.organization.id,
          action: "invitation.accepted",
          target: invitation.email,
          details: { roleCode: invitation.roleCode, accountCreated: false },
        });
        return c.json({ organization, roles, accountCreated: false }, 200);
      }

      if (session) throw invitationEmailMismatch();
      const body = c.req.valid("json");
      if (!body?.name || !body.password)
        throw badRequest("Para crear la cuenta hacen falta nombre y contraseña.");

      const user = await data.users.createWithPassword({
        email: invitation.email,
        name: body.name,
        password: body.password,
        locale: invitation.locale,
      });
      const roles = await data.memberships.join(
        tenant.scope,
        user.id,
        invitation.roleCode,
        invitation.position,
      );
      await data.invitations.markAccepted(tenant.scope, invitation.id, user.id);
      await linkFamily(user.id);
      await joinTeam(user.id);
      await data.audit.record({
        actorUserId: user.id,
        organizationId: tenant.organization.id,
        action: "invitation.accepted",
        target: invitation.email,
        details: { roleCode: invitation.roleCode, accountCreated: true },
      });

      // Sesión para la cuenta recién creada, con las mismas cookies que un login normal.
      const signIn = await data.auth.api.signInEmail({
        body: { email: invitation.email, password: body.password },
        headers: c.req.raw.headers,
        asResponse: true,
      });
      if (signIn.ok) {
        for (const cookie of signIn.headers.getSetCookie()) {
          c.header("set-cookie", cookie, { append: true });
        }
      } else {
        console.error("[invitations] la sesión tras aceptar no se pudo iniciar", signIn.status);
      }
      return c.json({ organization, roles, accountCreated: true }, 200);
    },
  );

  return app;
}
