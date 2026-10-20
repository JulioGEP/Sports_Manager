import { LOCALES } from "@sportsmanager/shared";
import { describe, expect, it } from "vitest";
import { escapeHtml, renderEmail } from "./templates.ts";

const url = "https://club-a.sportsmanager.test/invitations/abc";

describe("plantillas de email", () => {
  it("invitación en los tres idiomas, con club, quien invita, rol, caducidad y enlace", () => {
    const subjects = new Set<string>();
    for (const locale of LOCALES) {
      const email = renderEmail(
        locale,
        {
          template: "invitation",
          clubName: "Club A",
          inviterName: "Ana Admin",
          roleName: "Entrenador",
          url,
          expiresDays: 7,
        },
        { brandColor: "#d71920" },
      );
      expect(email.subject).toContain("Club A");
      for (const piece of ["Ana Admin", "Entrenador", url, "7"])
        expect(email.text).toContain(piece);
      expect(email.html).toContain(`href="${url}"`);
      expect(email.html).toContain("#d71920");
      expect(email.html).toContain(`<html lang="${locale}">`);
      subjects.add(email.subject);
    }
    expect(subjects.size).toBe(LOCALES.length);
  });

  it("restablecer contraseña: nombre, club, minutos y enlace", () => {
    const email = renderEmail(
      "ca",
      {
        template: "password_reset",
        clubName: "Club B",
        userName: "Bruno",
        url: "https://club-b.sportsmanager.test/reset-password?token=xyz",
        expiresMinutes: 60,
      },
      { brandColor: "#000000" },
    );
    expect(email.subject).toBe("Restableix la contrasenya");
    expect(email.text).toContain("Bruno");
    expect(email.text).toContain("Club B");
    expect(email.text).toContain("60");
    expect(email.html).toContain("reset-password?token=xyz");
  });

  it("escapa HTML en los valores externos y deja el texto plano tal cual", () => {
    const club = `<script>alert("x")</script>`;
    const email = renderEmail(
      "es",
      {
        template: "invitation",
        clubName: club,
        inviterName: "A & B",
        roleName: "Tutor",
        url,
        expiresDays: 1,
      },
      { brandColor: "#d71920" },
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("A &amp; B");
    expect(email.text).toContain(club);
    expect(escapeHtml(`'"<>&`)).toBe("&#39;&quot;&lt;&gt;&amp;");
  });

  it("un color de marca inválido cae al color por defecto", () => {
    const email = renderEmail(
      "en",
      { template: "password_reset", clubName: "C", userName: "U", url, expiresMinutes: 5 },
      { brandColor: "red; background:url(x)" },
    );
    expect(email.html).not.toContain("url(x)");
    expect(email.html).toContain("#111827");
  });
});
