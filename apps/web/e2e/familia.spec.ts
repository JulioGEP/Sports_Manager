import { expect, test } from "@playwright/test";
import { CLUB, expectLegibleButtons, login, shot, signOut, TEST_LOGO_PNG } from "./helpers";

/** Lo que ven una familia y una entrenadora del club demo (cuentas precargadas, Bloque 11). */
test.describe("familia y entrenadora", () => {
  test("la familia solo ve a sus jugadores", async ({ page }, info) => {
    await login(page, "familia@demo.test");
    await expect(page.getByText("Hola, Laura")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tu familia" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Marc Martí" })).toBeVisible();
    await shot(page, "46-familia-inicio", info.project.name);
    await expectLegibleButtons(page);
    await expect(page.getByRole("link", { name: "Deportistas" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Secciones" })).toHaveCount(0);

    await page.getByRole("link", { name: "Mi familia" }).first().click();
    await expect(page.getByRole("heading", { name: "Mi familia" })).toBeVisible();
    await expect(page.getByText("Clara Martí")).toBeVisible();
    await expect(page.getByText("Alevín A")).toBeVisible();
    await expect(page.getByText("Benjamín A")).toBeVisible();
    await expect(page.getByText(/Carla Vidal/)).toBeVisible();
    await shot(page, "47-familia", info.project.name);
    await expectLegibleButtons(page);

    // La ficha de uno de los suyos (Bloque 13): equipo, objetivo, reto y movimientos; sin indicadores.
    await page.getByRole("link", { name: "Clara Martí" }).first().click();
    await page.waitForURL(/\/family\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { level: 1, name: "Clara Martí" })).toBeVisible();
    await expect(page.getByText("Eres madre", { exact: true })).toBeVisible();
    await expect(page.getByText("4 años en el club")).toBeVisible();
    await expect(
      page.getByText("Mejorar la conducción con la pierna no dominante", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Reto de hábitos 2026-27")).toBeVisible();
    await expect(
      page.getByText("El club todavía no ha compartido el plan de desarrollo."),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Indicadores" })).toHaveCount(0);
    await shot(page, "47b-familia-ficha", info.project.name);
    await expectLegibleButtons(page);
    await page.getByLabel("Cambiar foto").setInputFiles({
      name: "clara.png",
      mimeType: "image/png",
      buffer: TEST_LOGO_PNG,
    });
    await expect(page.getByText("Foto guardada.")).toBeVisible();
    await expect(page.getByRole("img", { name: "Foto de Clara Martí" })).toBeVisible();

    // Las rutas del personal no abren para una familia.
    await page.goto(`${CLUB}/players`);
    await expect(page.getByRole("heading", { name: "Deportistas" })).toHaveCount(0);
    await signOut(page);
  });

  test("la entrenadora gestiona la plantilla de su equipo, no la de los demás", async ({
    page,
  }, info) => {
    await login(page, "entrenador@demo.test");
    await expect(page.getByText("Hola, Carla")).toBeVisible();
    // Su panel: los jugadores de sus equipos y qué hace falta en sus fichas (Bloque 13).
    await expect(page.getByRole("heading", { name: "Mis jugadores" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Alevín A/ }).first()).toBeVisible();
    await shot(page, "48b-entrenadora-inicio", info.project.name);
    await page.getByRole("link", { name: "Secciones" }).first().click();
    await page.getByRole("link", { name: /Fútbol sala/ }).click();
    await page.getByRole("link", { name: "Alevín A" }).click();
    await expect(page.getByRole("heading", { name: "Alevín A" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Clara Martí" })).toBeVisible();
    // Su equipo: edita la plantilla, pero no da de alta jugadores nuevos ni edita el equipo.
    await expect(page.getByRole("button", { name: "Añadir jugador" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar equipo" })).toHaveCount(0);
    await shot(page, "48-entrenadora-equipo", info.project.name);
    await expectLegibleButtons(page);
    await page.getByRole("button", { name: "Añadir jugador" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("button", { name: "Añadir a la plantilla" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Nuevo jugador" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    // Su jugadora: valora el objetivo. Los otros equipos de la sección ni aparecen (Bloque 19).
    await page.getByRole("link", { name: "Clara Martí" }).click();
    await expect(page.getByRole("button", { name: "Valorar" })).toBeVisible();
    await page.goto(`${CLUB}/sections`);
    await page.getByRole("link", { name: /Fútbol sala/ }).click();
    await expect(page.getByRole("link", { name: "Alevín A" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Infantil A" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Socios" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Personal" })).toHaveCount(0);
    await signOut(page);
  });
});
