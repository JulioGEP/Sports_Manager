import type { EmailTemplate, Locale } from "@sportsmanager/shared";
import { t } from "@sportsmanager/shared/i18n";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export type EmailContent =
  | {
      template: "invitation";
      clubName: string;
      inviterName: string;
      roleName: string;
      url: string;
      expiresDays: number;
    }
  | {
      template: "password_reset";
      clubName: string;
      userName: string;
      url: string;
      expiresMinutes: number;
    };

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

interface Pieces {
  subject: string;
  greeting: string;
  body: string;
  action: string;
  expires: string;
  ignore: string;
}

function pieces(locale: Locale, content: EmailContent): Pieces {
  if (content.template === "invitation") {
    const params = {
      club: content.clubName,
      inviter: content.inviterName,
      role: content.roleName,
      days: content.expiresDays,
    };
    return {
      subject: t(locale, "email.invitation.subject", params),
      greeting: t(locale, "email.invitation.greeting", params),
      body: t(locale, "email.invitation.body", params),
      action: t(locale, "email.invitation.action", params),
      expires: t(locale, "email.invitation.expires", params),
      ignore: t(locale, "email.invitation.ignore", params),
    };
  }
  const params = {
    club: content.clubName,
    name: content.userName,
    minutes: content.expiresMinutes,
  };
  return {
    subject: t(locale, "email.passwordReset.subject", params),
    greeting: t(locale, "email.passwordReset.greeting", params),
    body: t(locale, "email.passwordReset.body", params),
    action: t(locale, "email.passwordReset.action", params),
    expires: t(locale, "email.passwordReset.expires", params),
    ignore: t(locale, "email.passwordReset.ignore", params),
  };
}

/**
 * Plantillas de email (ADR 0018): texto plano y HTML sencillo, con el nombre del club y un
 * botón. Sin imágenes ni logo hasta el Bloque 5. Todo valor externo se escapa en el HTML.
 */
export function renderEmail(
  locale: Locale,
  content: EmailContent,
  options: { brandColor: string },
): RenderedEmail {
  const p = pieces(locale, content);
  const fallback = t(locale, "email.fallbackLink");
  const signature = t(locale, "email.signature");
  const text = [
    p.greeting,
    "",
    p.body,
    "",
    `${p.action}: ${content.url}`,
    "",
    p.expires,
    p.ignore,
    "",
    signature,
  ].join("\n");

  const color = /^#[0-9a-f]{6}$/i.test(options.brandColor) ? options.brandColor : "#111827";
  const html = `<!doctype html>
<html lang="${locale}">
<body style="margin:0;padding:24px;background:#f4f7fb;font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;line-height:1.55;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ec;border-radius:16px;overflow:hidden;">
    <div style="padding:16px 24px;background:${color};color:#ffffff;font-weight:700;font-size:18px;">${escapeHtml(content.clubName)}</div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;">${escapeHtml(p.greeting)}</p>
      <p style="margin:0 0 24px;">${escapeHtml(p.body)}</p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(content.url)}" style="display:inline-block;padding:12px 20px;background:${color};color:#ffffff;text-decoration:none;border-radius:999px;font-weight:700;">${escapeHtml(p.action)}</a>
      </p>
      <p style="margin:0 0 8px;color:#64748b;font-size:14px;">${escapeHtml(p.expires)}</p>
      <p style="margin:0 0 24px;color:#64748b;font-size:14px;">${escapeHtml(p.ignore)}</p>
      <p style="margin:0 0 8px;color:#64748b;font-size:12px;">${escapeHtml(fallback)}</p>
      <p style="margin:0 0 24px;font-size:12px;word-break:break-all;"><a href="${escapeHtml(content.url)}" style="color:#2563eb;">${escapeHtml(content.url)}</a></p>
      <p style="margin:0;color:#64748b;font-size:14px;">${escapeHtml(signature)}</p>
    </div>
  </div>
</body>
</html>`;

  return { subject: p.subject, text, html };
}

export function templateOf(content: EmailContent): EmailTemplate {
  return content.template;
}
