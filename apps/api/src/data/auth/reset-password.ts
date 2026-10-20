import { PASSWORD_RESET_TTL_MINUTES, resolveLocale, WEB_PATHS } from "@sportsmanager/shared";
import { brandTokens } from "@sportsmanager/shared/design";
import type { ApiConfig } from "../../config.ts";
import { classifyRequest, publicOrigin } from "../../tenancy.ts";
import type { EmailSender } from "../email/sender.ts";
import { renderEmail } from "../email/templates.ts";
import type { organizationsRepo } from "../organizations.ts";
import type { ResetPasswordRequest } from "./index.ts";

export interface ResetPasswordDeps {
  config: ApiConfig;
  organizations: ReturnType<typeof organizationsRepo>;
  email: EmailSender;
}

/**
 * Email de restablecer contraseña. El enlace apunta al host desde el que se pidió, siempre
 * que ese host sea un club o la plataforma; el idioma es el del usuario y, si no tiene, el
 * del club. Nombre y color del club van en el email cuando el host es un club.
 */
export function createResetPasswordSender(deps: ResetPasswordDeps) {
  return async ({
    user,
    token,
    host,
    club,
    deployContext,
  }: ResetPasswordRequest): Promise<void> => {
    const klass = classifyRequest({ host, club }, deps.config, deployContext);
    const organization =
      klass.kind === "organization"
        ? (await deps.organizations.findBySlug(klass.slug))?.organization
        : undefined;
    const origin = publicOrigin(host, deps.config, deployContext);
    const url = `${origin}${WEB_PATHS.resetPassword}?token=${encodeURIComponent(token)}`;
    const locale = resolveLocale([user.locale, organization?.defaultLocale]);
    const rendered = renderEmail(
      locale,
      {
        template: "password_reset",
        clubName: organization?.name ?? "Sports Manager",
        userName: user.name,
        url,
        expiresMinutes: PASSWORD_RESET_TTL_MINUTES,
      },
      { brandColor: organization?.brandPrimaryColor ?? brandTokens["--color-brand-primary"] },
    );
    await deps.email.send({
      organizationId: organization?.id ?? null,
      to: user.email,
      locale,
      template: "password_reset",
      ...rendered,
    });
  };
}
