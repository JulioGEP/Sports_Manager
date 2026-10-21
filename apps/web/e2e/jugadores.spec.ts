import { expect, test } from "@playwright/test";
import {
  CLUB,
  expectLegibleButtons,
  login,
  readInvitationLink,
  shot,
  signOut,
  suffix,
  TEST_LOGO_PNG,
} from "./helpers";

/**
 * Deportistas y familias (Bloque 11): lista, ficha, invitación de familia y alta de un jugador.
 * Ficha ampliada (Bloque 12): foto, indicadores, objetivo, PDI, timeline y acciones prioritarias.
 */
test.describe("jugadores y familias", () => {
  test("lista, ficha, invitación de familia aceptada y baja", async ({ page }, info) => {
    const sfx = suffix(info.project.name);
    const email = `padre-${sfx}@demo.test`;
    await login(page);

    await page.getByRole("link", { name: "Deportistas" }).first().click();
    await expect(page.getByRole("heading", { name: "Deportistas" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Clara Martí" })).toBeVisible();
    await shot(page, "40-jugadores", info.project.name);
    await expectLegibleButtons(page);

    await page.getByLabel("Buscar por nombre").fill("Martí");
    await expect(page.getByRole("link", { name: "Marc Martí" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nil Soler" })).toHaveCount(0);

    await page.getByRole("link", { name: "Clara Martí" }).click();
    await expect(page.getByRole("heading", { name: "Clara Martí" })).toBeVisible();
    await expect(page.getByText("Laura Martí", { exact: true })).toBeVisible();
    await expect(page.getByText("Madre")).toBeVisible();
    await expect(page.getByRole("link", { name: "Alevín A" }).first()).toBeVisible();
    // La ficha ampliada llega sembrada: datos deportivos, indicadores, objetivo, PDI y timeline.
    await expect(page.getByText("Alevín · 2026-27")).toBeVisible();
    await expect(page.getByText("4 años en el club")).toBeVisible();
    await expect(page.getByText("Pie derecho").first()).toBeVisible();
    await expect(page.getByText("142 cm")).toBeVisible();
    await expect(
      page.getByText("Mejorar la conducción con la pierna no dominante", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Responsable: Carla Vidal")).toBeVisible();
    await expect(page.getByText("Estructura inicial")).toBeVisible();
    await expect(page.getByText("Dormir 9 horas")).toBeVisible();
    await expect(page.getByText("Entra en la plantilla de Alevín A (2026-27)")).toBeVisible();
    await expect(page.getByText("Alta en el club")).toBeVisible();
    await shot(page, "41-jugador-ficha", info.project.name);
    await expectLegibleButtons(page);

    // Foto: se reduce en el navegador y aparece en la cabecera.
    await page.getByLabel("Cambiar foto").setInputFiles({
      name: "clara.png",
      mimeType: "image/png",
      buffer: TEST_LOGO_PNG,
    });
    await expect(page.getByText("Foto guardada.")).toBeVisible();
    await expect(page.getByRole("img", { name: "Foto de Clara Martí" })).toBeVisible();

    // Indicadores: valorar una dimensión cambia la cifra.
    await page.getByRole("button", { name: "Valorar" }).click();
    const rate = page.getByRole("dialog");
    await expect(rate.getByRole("heading", { name: "Valorar a Clara Martí" })).toBeVisible();
    await rate.getByLabel("Puntuación").first().fill("75");
    await shot(page, "41b-jugador-valorar", info.project.name);
    await rate.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Indicadores guardados.")).toBeVisible();
    await expect(page.getByText("75", { exact: true })).toBeVisible();

    // Timeline: una anotación con fecha.
    await page.getByRole("button", { name: "Añadir registro" }).click();
    const note = page.getByRole("dialog");
    await note.getByLabel("Anotación").fill("Revisión trimestral con la familia.");
    await note.getByRole("button", { name: "Añadir registro" }).click();
    await expect(page.getByText("Registro añadido.")).toBeVisible();
    await expect(page.getByText("Revisión trimestral con la familia.")).toBeVisible();
    await shot(page, "41c-jugador-ficha-completa", info.project.name);

    // Invitar a la familia desde la ficha.
    await page.getByRole("button", { name: "Invitar familia" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Email", { exact: true }).fill(email);
    await sheet.getByLabel("Relación").selectOption("father");
    await shot(page, "42-jugador-invitar-familia", info.project.name);
    await sheet.getByRole("button", { name: "Enviar invitación" }).click();
    await expect(page.getByText(`Invitación enviada a ${email}.`)).toBeVisible();
    await expect(page.getByText(`comparte este enlace con ${email}`)).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await shot(page, "43-jugador-familia-pendiente", info.project.name);
    const link = await readInvitationLink(page);
    await signOut(page);

    // La familia acepta: crea su cuenta y entra viendo a su jugador.
    await page.goto(new URL(link).pathname);
    await expect(page.getByText("Como familia de Clara Martí.")).toBeVisible();
    await page.getByLabel("Tu nombre").fill("Pere Martí");
    await page.getByLabel("Contraseña", { exact: true }).fill("123456");
    await page.getByLabel("Repite la contraseña").fill("123456");
    await page.getByRole("button", { name: /Unirme a Club de demostración/ }).click();
    await page.waitForURL(new RegExp(`${CLUB}$`));
    await expect(page.getByText("Hola, Pere")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tu familia" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Clara Martí" })).toBeVisible();
    await signOut(page);

    // De vuelta la administración: alta de un jugador nuevo y baja.
    await login(page);
    await page.goto(`${CLUB}/players?new=1`);
    const create = page.getByRole("dialog");
    await create.getByLabel("Nombre", { exact: true }).fill("Teo");
    await create.getByLabel("Apellidos").fill(`Prueba ${sfx}`);
    await create.getByLabel("Fecha de nacimiento").fill("2016-05-05");
    await create.getByLabel("Alta en el club").fill("2024-09-01");
    await create.getByLabel("Equipo").selectOption({ label: "Alevín A" });
    await shot(page, "44-jugador-nuevo", info.project.name);
    await create.getByRole("button", { name: "Dar de alta" }).click();
    await expect(page.getByText(`Teo Prueba ${sfx} dado de alta.`)).toBeVisible();
    await expect(page.getByRole("heading", { name: `Teo Prueba ${sfx}` })).toBeVisible();
    await expect(page.getByRole("link", { name: "Alevín A" }).first()).toBeVisible();
    await expect(page.getByText("2 años en el club")).toBeVisible();
    // Una ficha nueva lista lo que falta y aún no tiene indicadores.
    await expect(page.getByText("Añadir fotografía")).toBeVisible();
    await expect(page.getByText("Definir el objetivo individual")).toBeVisible();
    await expect(page.getByText("Sin valorar").first()).toBeVisible();

    await page.getByRole("button", { name: "Dar de baja" }).click();
    const confirm = page.getByRole("dialog");
    await expect(confirm.getByText(`¿Dar de baja a Teo Prueba ${sfx}?`)).toBeVisible();
    await shot(page, "45-jugador-baja", info.project.name);
    await confirm.getByRole("button", { name: "Dar de baja" }).click();
    await expect(page.getByText(`Teo Prueba ${sfx} ha causado baja.`)).toBeVisible();
    await expect(page.getByText("De baja").first()).toBeVisible();
  });
});
