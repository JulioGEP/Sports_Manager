import { expect, test } from "@playwright/test";
import { CLUB, expectLegibleButtons, login, shot, signOut } from "./helpers";

/** Lo que ven una familia y una entrenadora del club demo (cuentas precargadas, Bloque 11). */
test.describe("familia y entrenadora", () => {
  test("la familia solo ve a sus jugadores", async ({ page }, info) => {
    await login(page, "familia@demo.test");
    await expect(page.getByText("Hola, Laura")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tu familia" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Marc Martí" })).toBeVisible();
    await shot(page, "46-familia-inicio", info.project.name);
    await expectLegibleButtons(page);
    await expect(page.getByRole("link", { name: "Jugadores" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Equipos" })).toHaveCount(0);

    await page.getByRole("link", { name: "Mi familia" }).first().click();
    await expect(page.getByRole("heading", { name: "Mi familia" })).toBeVisible();
    await expect(page.getByText("Clara Martí")).toBeVisible();
    await expect(page.getByText("Alevín A")).toBeVisible();
    await expect(page.getByText("Benjamín A")).toBeVisible();
    await expect(page.getByText(/Carla Vidal/)).toBeVisible();
    await shot(page, "47-familia", info.project.name);
    await expectLegibleButtons(page);

    // Las rutas del personal no abren para una familia.
    await page.goto(`${CLUB}/players`);
    await expect(page.getByRole("heading", { name: "Jugadores" })).toHaveCount(0);
    await signOut(page);
  });

  test("la entrenadora ve su equipo con la plantilla, sin poder cambiarla", async ({
    page,
  }, info) => {
    await login(page, "entrenador@demo.test");
    await expect(page.getByText("Hola, Carla")).toBeVisible();
    await page.getByRole("link", { name: "Equipos" }).first().click();
    await page
      .locator("tr, li")
      .filter({ hasText: "Alevín A" })
      .getByRole("link", { name: "Abrir" })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Alevín A" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Clara Martí" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Añadir jugador" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Quitar" })).toHaveCount(0);
    await shot(page, "48-entrenadora-equipo", info.project.name);
    await expectLegibleButtons(page);
    await signOut(page);
  });
});
