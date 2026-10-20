import { expect, test } from "@playwright/test";
import { expectLegibleButtons, login, shot, suffix, TEST_LOGO_PNG } from "./helpers";

test.describe("panel del club", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("miembros, invitación y roles", async ({ page }, info) => {
    const email = `entrenador-${suffix(info.project.name)}@demo.test`;
    await page.getByRole("link", { name: "Miembros" }).first().click();
    await expect(page.getByRole("heading", { name: "Miembros" })).toBeVisible();
    await expect(page.getByRole("cell", { name: /Admin Demo/ })).toBeVisible();
    await shot(page, "10-miembros", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("button", { name: "Invitar" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: "Invitar a alguien" })).toBeVisible();
    await drawer.getByLabel("Email", { exact: true }).fill(email);
    await drawer.getByLabel("Rol").selectOption("coach");
    await shot(page, "11-miembros-invitar", info.project.name);
    await expectLegibleButtons(page);
    await drawer.getByRole("button", { name: "Enviar invitación" }).click();

    await expect(page.getByRole("tab", { name: /Invitaciones/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText(`comparte este enlace con ${email}`)).toBeVisible();
    await expect(page.getByRole("cell", { name: email })).toBeVisible();
    await shot(page, "12-invitaciones", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("tab", { name: /^Miembros/ }).click();
    await page.getByRole("button", { name: "Roles" }).first().click();
    await expect(page.getByRole("dialog").getByText("Roles de Admin Demo")).toBeVisible();
    await shot(page, "13-miembros-roles", info.project.name);
    await expectLegibleButtons(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("ajustes: general, marca y logo", async ({ page }, info) => {
    await page.getByRole("link", { name: "Ajustes" }).first().click();
    await expect(page.getByRole("heading", { name: "Ajustes del club" })).toBeVisible();
    await expect(page.getByLabel("Nombre del club")).toHaveValue("Club de demostración");
    await shot(page, "20-ajustes-general", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("tab", { name: "Marca" }).click();
    await expect(page.getByRole("heading", { name: "Colores de marca" })).toBeVisible();
    await shot(page, "21-ajustes-marca", info.project.name);
    await expectLegibleButtons(page);
    await page.getByLabel("Color principal").fill("#0f766e");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Colores guardados.")).toBeVisible();
    await expect
      .poll(async () =>
        page
          .locator("header.topbar")
          .evaluate((el) => getComputedStyle(el).getPropertyValue("--color-brand-primary").trim()),
      )
      .toBe("#0f766e");
    await shot(page, "22-ajustes-marca-guardada", info.project.name);

    await page.getByRole("tab", { name: "Logo" }).click();
    await expect(page.getByRole("heading", { name: "Subir logo" })).toBeVisible();
    await shot(page, "23-ajustes-logo", info.project.name);
    await page.locator("input[type=file]").setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: TEST_LOGO_PNG,
    });
    await expect(page.getByText("Logo guardado.")).toBeVisible();
    await expect(page.getByRole("img", { name: "Logo del club" })).toBeVisible();
    await shot(page, "24-ajustes-logo-subido", info.project.name);
    await page.getByRole("button", { name: "Quitar logo" }).click();
    await expect(page.getByText("Logo quitado.")).toBeVisible();
    await expect(page.getByText("Todavía no hay logo.")).toBeVisible();

    await page.getByRole("tab", { name: "Marca" }).click();
    await page.getByLabel("Color principal").fill("#1d4ed8");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Colores guardados.")).toBeVisible();
  });
});
