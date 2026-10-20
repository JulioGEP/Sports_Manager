import { expect, test } from "@playwright/test";
import { expectLegibleButtons, login, readInvitationLink, shot, signOut, suffix } from "./helpers";

test.describe("invitación de punta a punta", () => {
  test("el club invita, la persona crea su cuenta y entra con su rol", async ({ page }, info) => {
    const email = `nueva-${suffix(info.project.name)}@demo.test`;

    await login(page);
    await page.goto("/members?invite=1");
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Email", { exact: true }).fill(email);
    await drawer.getByLabel("Rol").selectOption("guardian");
    await drawer.getByRole("button", { name: "Enviar invitación" }).click();
    await expect(page.getByText(`comparte este enlace con ${email}`)).toBeVisible();
    const link = await readInvitationLink(page);
    await signOut(page);

    await page.goto(new URL(link).pathname);
    await expect(
      page.getByRole("heading", { name: /Invitación a Club de demostración/ }),
    ).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await shot(page, "40-invitacion", info.project.name);
    await expectLegibleButtons(page);

    await page.getByLabel("Tu nombre").fill("Marta Nueva");
    await page.getByLabel("Contraseña", { exact: true }).fill("123456");
    await page.getByLabel("Repite la contraseña").fill("123456");
    await page.getByRole("button", { name: /Unirme a Club de demostración/ }).click();

    await expect(page.getByRole("heading", { name: /Hola, Marta/ })).toBeVisible();
    await expect(page.getByText("Tutor")).toBeVisible();
    await shot(page, "41-inicio-tutor", info.project.name);
    await expectLegibleButtons(page);
    await expect(page.getByRole("link", { name: "Miembros" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Ajustes" })).toHaveCount(0);

    // Con un solo club, «Mis clubes» no pregunta: vuelve a la portada de ese club.
    await page.goto("/clubs");
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.getByRole("heading", { name: /Hola, Marta/ })).toBeVisible();

    // Una cuenta de club no entra en el negocio: aviso y opción de cambiar de cuenta.
    await page.goto("/admin");
    await expect(page.getByText("no es administradora de plataforma")).toBeVisible();
    await shot(page, "42-negocio-cuenta-de-club", info.project.name);
    await expectLegibleButtons(page);
    await page.getByRole("button", { name: "Entrar con otra cuenta" }).click();
    await page.waitForURL(/\/admin\/login/);
    await expect(page.getByRole("heading", { name: "Administración del negocio" })).toBeVisible();
  });
});
