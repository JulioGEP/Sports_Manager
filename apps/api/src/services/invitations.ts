import {
  WEB_PATHS,
  type Invitation,
  type InvitationSentResponse,
  type Locale,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import {
  invitationState,
  renderEmail,
  type DataLayer,
  type InvitationRecord,
  type IssuedInvitation,
  type OrganizationRow,
} from "../data/index.ts";

export function invitationDto(record: InvitationRecord): Invitation {
  return {
    id: record.id,
    email: record.email,
    roleCode: record.roleCode,
    locale: record.locale,
    state: invitationState(record.status, record.expiresAt),
    expiresAt: record.expiresAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    invitedByName: record.invitedByName,
    acceptedAt: record.acceptedAt?.toISOString() ?? null,
  };
}

/**
 * Envía el email de invitación (ADR 0018) y devuelve la respuesta de la API. `origin` es la
 * dirección del club donde vive el enlace: el host actual en las rutas del club, la dirección
 * calculada del club en el admin interno.
 */
export async function sendInvitationEmail(
  config: ApiConfig,
  data: DataLayer,
  input: {
    organization: OrganizationRow;
    issued: IssuedInvitation;
    inviterName: string;
    origin: string;
  },
): Promise<InvitationSentResponse> {
  const { organization, issued } = input;
  const url = `${input.origin}${WEB_PATHS.invitation(issued.token)}`;
  const locale: Locale = issued.invitation.locale;
  const roleName = await data.roles.nameOf(issued.invitation.roleCode);
  const rendered = renderEmail(
    locale,
    {
      template: "invitation",
      clubName: organization.name,
      inviterName: input.inviterName,
      roleName: roleName[locale],
      url,
      expiresDays: config.invitationTtlDays,
    },
    { brandColor: organization.brandPrimaryColor },
  );
  const sent = await data.email.send({
    organizationId: organization.id,
    to: issued.invitation.email,
    locale,
    template: "invitation",
    ...rendered,
  });
  return {
    invitation: invitationDto(issued.invitation),
    emailStatus: sent.status,
    /** Solo con transporte `outbox`: permite probar el flujo sin Resend (ADR 0018). */
    acceptUrl: config.email.transport === "outbox" ? url : null,
  };
}
