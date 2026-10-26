import { expect, test } from "@playwright/test";
import { expectLegibleButtons, login, shot, signOut } from "./helpers";

/**
 * Biblioteca de ejercicios del box (ADR 0050) sobre el box de demostración: la atleta la consulta
 * (sin pizarra ni campos de deporte de equipo) y el coach añade un ejercicio. Los enlaces de
 * antes (`/library`, `/drills/new`) llevan aquí.
 */
const BOX = "/demo-box";
const PASSWORD = "123456";

test.describe("biblioteca de ejercicios", () => {
  test("la atleta busca un ejercicio y repasa cómo se hace", async ({ page }, info) => {
    await login(page, "atleta@demo.test", PASSWORD, BOX);
    await page.goto(`${BOX}/library`);
    await expect(page).toHaveURL(new RegExp(`${BOX}/exercises$`));
    await expect(page.getByRole("heading", { level: 1, name: "Ejercicios" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nuevo ejercicio" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Back squat/ }).first()).toBeVisible();
    await shot(page, "280-box-ejercicios", info.project.name);
    await expectLegibleButtons(page);

    await page
      .getByRole("button", { name: /Halterofilia/ })
      .first()
      .click();
    await expect(page.getByRole("button", { name: /Back squat/ })).toHaveCount(0);
    await page.getByRole("button", { name: /^Todos/ }).click();

    // Sin tildes ni mayúsculas, por nombre o por descripción.
    await page.getByRole("searchbox", { name: "Buscar" }).fill("SENTADILLA con la barra");
    await expect(page.getByRole("button", { name: /Back squat/ })).toBeVisible();
    await page
      .getByRole("button", { name: /Back squat/ })
      .first()
      .click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Puntos clave")).toBeVisible();
    await expect(sheet.getByText("Errores comunes")).toBeVisible();
    await expect(sheet.getByText(/Enlazado a Back squat/)).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Editar" })).toHaveCount(0);
    await shot(page, "281-box-ejercicio", info.project.name);
    await sheet.getByRole("button", { name: "Cerrar" }).last().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await signOut(page);
  });

  test("el coach añade un ejercicio sin pizarra", async ({ page }, info) => {
    // Escritorio y móvil comparten base: un nombre por proyecto.
    const name = `Turkish get-up ${info.project.name}`;
    await login(page, "coach@demo.test", PASSWORD, BOX);
    await page.goto(`${BOX}/drills/new`);
    await expect(page).toHaveURL(new RegExp(`${BOX}/exercises$`));
    await page.getByRole("button", { name: "Nuevo ejercicio" }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Nombre").fill(name);
    await sheet.getByRole("button", { name: "Kettlebell", exact: true }).first().click();
    await sheet
      .getByLabel("Cómo se hace")
      .fill("Desde tumbado, levantarse con la kettlebell bloqueada arriba.");
    await sheet
      .getByLabel("Puntos clave")
      .fill("Mirar la kettlebell todo el rato.\nBrazo bloqueado.\nMovimiento lento.");
    await sheet.getByLabel("Escalados y progresiones").fill("Sin peso.\nCon zapatilla en el puño.");
    // Nada de pizarra, jugadores ni espacio.
    await expect(sheet.getByText("Pizarra")).toHaveCount(0);
    await expect(sheet.getByText(/Jugadores/)).toHaveCount(0);
    await shot(page, "282-box-ejercicio-editar", info.project.name);
    await sheet.getByRole("button", { name: "Añadir ejercicio" }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name })).toBeVisible();
    await expect(
      page.getByRole("dialog").getByText("Mirar la kettlebell todo el rato."),
    ).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Archivar" }).click();
    await expect(page.getByRole("button", { name: new RegExp(name) })).toHaveCount(0);
    await signOut(page);
  });
});
