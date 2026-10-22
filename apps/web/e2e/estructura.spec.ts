import { expect, test } from "@playwright/test";
import { CLUB, expectLegibleButtons, login, shot, suffix } from "./helpers";

/**
 * Secciones por deporte con categorías, equipos y grupos (Bloque 14), ficha de equipo con
 * plantilla, cuerpo técnico y horario semanal (Bloques 11 y 16), con el club demo precargado.
 */
test.describe("estructura del club", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("la paleta de mandos lleva a una persona, un equipo o una acción con dos letras", async ({
    page,
  }, info) => {
    // ⌘K (Ctrl K) desde el inicio: buscar sin acentos ("alev" encuentra "Alevín A") y abrir con retorno.
    await expect(page.getByRole("button", { name: "Buscar o hacer" }).first()).toBeVisible();
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Buscar o hacer" });
    await expect(palette.getByRole("combobox")).toBeFocused();
    await expect(palette.getByText("Nuevo deportista")).toBeVisible();
    await palette.getByRole("combobox").fill("alev");
    await expect(palette.getByRole("option", { name: /Alevín A/ }).first()).toBeVisible();
    await shot(page, "03d-paleta", info.project.name);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Alevín A" })).toBeVisible();
    // Por el botón de la barra, una persona: la ficha de Clara Martí.
    await page.getByRole("button", { name: "Buscar o hacer" }).first().click();
    await palette.getByRole("combobox").fill("clara mar");
    await palette
      .getByRole("option", { name: /Clara Martí/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Clara Martí" })).toBeVisible();
    // Escape cierra; la paleta recuerda lo último abierto.
    await page.keyboard.press("Control+k");
    await expect(palette.getByText("Recientes")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  });

  test("secciones, ficha de sección, categoría y equipo nuevos", async ({ page }, info) => {
    const sfx = suffix(info.project.name);
    await page.getByRole("link", { name: "Secciones", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Secciones" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Fútbol sala/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Baloncesto/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Natación/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Yoga/ })).toBeVisible();
    await shot(page, "30-secciones", info.project.name);
    await expectLegibleButtons(page);

    // Nueva sección: el deporte propone el nombre y las categorías.
    await page.getByRole("button", { name: "Nueva sección" }).first().click();
    const sectionSheet = page.getByRole("dialog");
    await sectionSheet.getByLabel("Deporte").selectOption({ label: "Pádel" });
    await expect(sectionSheet.getByLabel("Nombre", { exact: true })).toHaveValue("Pádel");
    await sectionSheet.getByLabel("Nombre", { exact: true }).fill(`Pádel ${sfx}`);
    await shot(page, "32-seccion-nueva", info.project.name);
    await sectionSheet.getByRole("button", { name: "Crear sección" }).click();
    await expect(page.getByText(`Sección Pádel ${sfx} creada.`)).toBeVisible();
    // Al crearla se abre su ficha, con las categorías que propuso el deporte.
    await expect(page.getByRole("heading", { name: new RegExp(`Pádel ${sfx}`) })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
    await page.getByRole("link", { name: "Secciones", exact: true }).first().click();
    await expect(page.getByRole("link", { name: new RegExp(`Pádel ${sfx}`) })).toBeVisible();

    // Ficha de la sección de fútbol sala: categorías con sus equipos, personal y resumen.
    await page.getByRole("link", { name: /Fútbol sala/ }).click();
    await expect(page.getByRole("heading", { name: /Fútbol sala/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Alevín A" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Infantil A" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
    await shot(page, "31-seccion-ficha", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("tab", { name: /Personal/ }).click();
    await expect(page.getByText("Carla Vidal").first()).toBeVisible();
    await shot(page, "31b-seccion-personal", info.project.name);
    await page.getByRole("tab", { name: /Equipos/ }).click();

    // Nueva categoría en la sección.
    await page.getByRole("button", { name: "Nueva categoría" }).click();
    const categorySheet = page.getByRole("dialog");
    await categorySheet.getByLabel("Nombre", { exact: true }).fill(`Cadete ${sfx}`);
    await categorySheet.getByLabel("Nacidos desde").fill("2011");
    await categorySheet.getByLabel("Nacidos hasta").fill("2012");
    await shot(page, "33-categoria-nueva", info.project.name);
    await categorySheet.getByRole("button", { name: "Crear categoría" }).click();
    await expect(page.getByText(`Categoría Cadete ${sfx} creada.`)).toBeVisible();
    await expect(page.getByRole("heading", { name: `Cadete ${sfx}` })).toBeVisible();

    // Nuevo equipo en esa categoría, en la temporada actual. Se crea desde la cabecera de la
    // sección y la categoría se elige en el formulario.
    await page.getByRole("button", { name: "Nuevo equipo" }).click();
    const teamSheet = page.getByRole("dialog");
    await teamSheet.getByLabel("Nombre del equipo").fill(`Cadete A ${sfx}`);
    await teamSheet.getByLabel("Categoría").selectOption({ label: `Cadete ${sfx}` });
    await expect(teamSheet.getByLabel("Categoría")).toHaveValue(/.+/);
    await shot(page, "34-equipo-nuevo", info.project.name);
    await teamSheet.getByRole("button", { name: "Crear equipo" }).click();
    await expect(page.getByText(`Cadete A ${sfx} creado.`)).toBeVisible();
    // Al crearlo se abre su ficha, vacía y con la categoría en el encabezado.
    await expect(page.getByRole("heading", { name: new RegExp(`Cadete A ${sfx}`) })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Horario semanal" })).toBeVisible();
  });

  test("ficha de equipo: plantilla, cuerpo técnico y horario", async ({ page }, info) => {
    await page.goto(`${CLUB}/sections`);
    await page.getByRole("link", { name: /Fútbol sala/ }).click();
    await page.getByRole("link", { name: "Alevín A" }).click();
    await expect(page.getByRole("heading", { name: "Alevín A" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Clara Martí" })).toBeVisible();
    await expect(page.getByText("Carla Vidal")).toBeVisible();
    // Horario semanal sembrado: de aquí sale la agenda de la temporada (Bloque 16).
    await expect(page.getByRole("heading", { name: "Horario semanal" })).toBeVisible();
    await expect(page.getByText(/Lunes|Martes|Miércoles|Jueves|Viernes/).first()).toBeVisible();
    await shot(page, "35-equipo-ficha", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("button", { name: "Editar horario" }).click();
    const schedule = page.getByRole("dialog");
    await expect(schedule.getByRole("heading", { name: "Horario semanal" })).toBeVisible();
    await expect(schedule.getByLabel("Día").first()).toBeVisible();
    await shot(page, "35b-equipo-horario", info.project.name);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    // Añadir a la plantilla a alguien que ya está en el club (el primero disponible).
    await page.getByRole("button", { name: "Añadir jugador" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Buscar por nombre").fill("Joel");
    await sheet.getByLabel("Dorsal").fill("12");
    await sheet.getByLabel("Posición").fill("Ala");
    await shot(page, "36-equipo-anadir-jugador", info.project.name);
    await sheet.getByRole("button", { name: "Añadir a la plantilla" }).click();
    await expect(page.getByText("Joel Castro ya está en Alevín A.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Joel Castro" })).toBeVisible();

    // Y quitarlo: confirmación con el nombre.
    await page
      .locator("tr, li")
      .filter({ hasText: "Joel Castro" })
      .getByRole("button", { name: "Quitar" })
      .first()
      .click();
    const confirm = page.getByRole("dialog");
    await expect(confirm.getByText("¿Quitar a Joel Castro de Alevín A?")).toBeVisible();
    await confirm.getByRole("button", { name: "Quitar" }).click();
    await expect(page.getByText("Joel Castro ya no está en Alevín A.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Joel Castro" })).toHaveCount(0);
  });
});
