import { expect, test, type Page } from "@playwright/test";
import { CLUB, expectLegibleButtons, login, shot, suffix } from "./helpers";

/**
 * Entrenamiento, carga y salud (bloques 21 a 26, ADR 0039) sobre la semilla del club demo: el
 * entrenador del Sénior A planifica y cierra su sesión, consulta la temporada, el histórico, la
 * carga y los tests y crea una tarea con su pizarra; fisioterapia ve la enfermería y la salud de
 * un jugador; el deportista adulto responde su bienestar desde su cuenta; y a la administración
 * solo se le puede abrir Salud por excepción.
 */
const PASSWORD = "123456";
/** La semana sembrada del Sénior A (las fechas de la semilla son fijas). */
const WEEK = "2026-10-19";

/** Abre la semana sembrada del Sénior A desde la portada de entrenamiento. */
async function openSeniorWeek(page: Page) {
  await page.goto(`${CLUB}/training`);
  await expect(page.getByRole("heading", { name: "Entrenamiento", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Abrir la semana" }).first().click();
  await expect(page.getByRole("heading", { name: "Semana de entrenamiento" })).toBeVisible();
  await page.goto(`${page.url().split("?")[0]}?date=${WEEK}`);
  await expect(page.getByText("Velocidad, finalización y ABP")).toBeVisible();
}

test.describe("entrenamiento", () => {
  test("el entrenador planifica la semana, abre y cierra una sesión y crea una tarea", async ({
    page,
  }, info) => {
    // Recorre ocho pantallas con sus capturas: necesita más que el minuto por defecto.
    test.setTimeout(180_000);
    const sfx = suffix(info.project.name);
    await login(page, "senior@demo.test", PASSWORD);

    // La entrada "Entrenamiento" está en la navegación; con un solo equipo, la portada lo destaca.
    if (info.project.name === "escritorio")
      await expect(page.getByRole("link", { name: "Entrenamiento" }).first()).toBeVisible();
    await page.goto(`${CLUB}/training`);
    await expect(page.getByRole("heading", { name: "Sénior A" })).toBeVisible();
    await shot(page, "200-entrenamiento", info.project.name);
    await expectLegibleButtons(page);

    // Semana del equipo: partidos, sesiones con su estado y "A tener en cuenta".
    await openSeniorWeek(page);
    await expect(page.getByText("Salida de presión y defensa sin falta")).toBeVisible();
    await expect(page.getByRole("heading", { name: "A tener en cuenta" })).toBeVisible();
    await expect(page.getByText(/^insights\./)).toHaveCount(0);
    await shot(page, "201-entrenamiento-semana", info.project.name);
    await expectLegibleButtons(page);

    // La sesión planificada: bloques, plantilla con su disponibilidad y el cierre.
    await page.getByRole("link", { name: /Velocidad, finalización y ABP/ }).click();
    await expect(page.getByRole("heading", { name: "Plantilla del día" })).toBeVisible();
    await expect(page.getByText("Kike Ramos").first()).toBeVisible();
    await expect(page.getByText("Limitado").first()).toBeVisible();
    await shot(page, "202-entrenamiento-sesion", info.project.name);
    await expectLegibleButtons(page);

    const close = page.getByRole("button", { name: /^(Cerrar sesión|Editar el cierre)$/ }).first();
    await close.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: "Cerrar la sesión" })).toBeVisible();
    await shot(page, "203-entrenamiento-cierre", info.project.name);
    await sheet.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page.getByText(/^Sesión cerrada con/)).toBeVisible();

    // Modo pista: una tarea por pantalla, a pantalla completa y sin la navegación del club.
    await page.goto(page.url().replace(/\/sessions\/([^/?]+).*$/, "/sessions/$1/court"));
    await expect(page.getByText(/Tarea 1 de \d+/)).toBeVisible();
    await shot(page, "204-entrenamiento-pista", info.project.name);
    await page.getByRole("button", { name: "Siguiente" }).click();
    await expect(page.getByText(/Tarea 2 de \d+/)).toBeVisible();

    // Temporada, histórico, carga y tests del equipo.
    await openSeniorWeek(page);
    await page.getByRole("link", { name: "Temporada" }).first().click();
    await expect(page.getByRole("heading", { name: "Plan de temporada" })).toBeVisible();
    await shot(page, "205-entrenamiento-temporada", info.project.name);

    await openSeniorWeek(page);
    await page.getByRole("link", { name: "Histórico" }).first().click();
    await expect(page.getByRole("heading", { name: "Histórico de sesiones" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Descargar Excel" })).toBeVisible();
    await shot(page, "206-entrenamiento-historico", info.project.name);

    await openSeniorWeek(page);
    await page.getByRole("link", { name: "Carga" }).first().click();
    await expect(page.getByRole("heading", { name: "Carga del equipo" })).toBeVisible();
    await expect(page.getByText(/no una predicción/).first()).toBeVisible();
    await shot(page, "207-entrenamiento-carga", info.project.name);
    await expectLegibleButtons(page);

    await openSeniorWeek(page);
    await page.getByRole("link", { name: "Tests físicos" }).first().click();
    await expect(page.getByRole("heading", { name: "Tests físicos" })).toBeVisible();
    await shot(page, "208-entrenamiento-tests", info.project.name);

    // Biblioteca: las tareas sembradas con su pizarra y una tarea nueva dibujada en la pista.
    await page.goto(`${CLUB}/drills`);
    await expect(page.getByRole("heading", { name: "Biblioteca de tareas" })).toBeVisible();
    await expect(page.getByText("Rondo 4x4+2 comodines").first()).toBeVisible();
    await shot(page, "209-entrenamiento-biblioteca", info.project.name);
    await page.getByRole("link", { name: "Nueva tarea" }).first().click();
    await expect(page.getByRole("heading", { name: "Nueva tarea" })).toBeVisible();
    await page.getByLabel("Nombre", { exact: true }).fill(`Rondo de prueba ${sfx}`);
    const board = page.getByRole("img", { name: /^Pizarra con/ });
    const box = await board.boundingBox();
    if (!box) throw new Error("la pizarra no se ve");
    await board.click({ position: { x: box.width * 0.3, y: box.height * 0.4 } });
    await board.click({ position: { x: box.width * 0.6, y: box.height * 0.6 } });
    await page.getByRole("button", { name: "Pase", exact: true }).click();
    await board.click({ position: { x: box.width * 0.3, y: box.height * 0.4 } });
    await board.click({ position: { x: box.width * 0.6, y: box.height * 0.6 } });
    await expect(page.getByRole("img", { name: "Pizarra con 2 piezas y 1 flechas" })).toBeVisible();
    await shot(page, "210-entrenamiento-tarea-nueva", info.project.name);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Tarea creada.")).toBeVisible();
    await expect(page.getByRole("heading", { name: `Rondo de prueba ${sfx}` })).toBeVisible();
  });

  test("fisioterapia ve la enfermería y la salud de un jugador", async ({ page }, info) => {
    await login(page, "fisio@demo.test", PASSWORD);
    await page.goto(`${CLUB}/infirmary`);
    await expect(page.getByRole("heading", { name: "Enfermería" })).toBeVisible();
    await expect(page.getByText("Toni Bermejo").first()).toBeVisible();
    await expect(page.getByText("Kike Ramos").first()).toBeVisible();
    await shot(page, "211-entrenamiento-enfermeria", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("link", { name: "Toni Bermejo" }).first().click();
    await expect(page.getByRole("heading", { name: "Toni Bermejo", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Salud" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Isquiotibiales · Muscular" })).toBeVisible();
    await expect(
      page.getByText("Cada consulta de esta sección queda registrada en la auditoría."),
    ).toBeVisible();
    await shot(page, "212-entrenamiento-rendimiento-salud", info.project.name);
    await expectLegibleButtons(page);
  });

  test("el deportista adulto responde su bienestar desde su cuenta", async ({ page }, info) => {
    await login(page, "jugador@demo.test", PASSWORD);
    if (info.project.name === "escritorio")
      await expect(page.getByRole("link", { name: "Mi bienestar" }).first()).toBeVisible();
    await page.goto(`${CLUB}/me`);
    await expect(page.getByRole("heading", { name: "Mi bienestar", level: 1 })).toBeVisible();
    for (const item of ["Sueño", "Fatiga", "Dolor muscular", "Estrés", "Ánimo"]) {
      const group = page.getByRole("group", { name: item });
      if ((await group.count()) > 0) await group.getByRole("button").nth(3).click();
    }
    await shot(page, "213-entrenamiento-mi-bienestar", info.project.name);
    await page.getByRole("button", { name: /^(Guardar|Actualizar)$/ }).click();
    await expect(page.getByText("Bienestar guardado.")).toBeVisible();
  });

  test("a la administración solo se le puede abrir Salud por excepción", async ({ page }) => {
    await login(page);
    await page.goto(`${CLUB}/staff`);
    await page.getByRole("tab", { name: "Acceso" }).click();
    await page.getByRole("button", { name: "Añadir excepción" }).click();
    const sheet = page.getByRole("dialog");
    const person = sheet.getByLabel("Persona", { exact: true });
    const admin = await person
      .locator("option", { hasText: "Administrador del club" })
      .first()
      .getAttribute("value");
    if (!admin) throw new Error("la administración no aparece entre las personas");
    await person.selectOption(admin);
    await expect(sheet.getByText(/lo ve todo salvo Salud/)).toBeVisible();
    await expect(sheet.getByRole("checkbox", { name: "Salud", exact: true })).toBeEnabled();
    await expect(sheet.getByRole("checkbox", { name: "Salud", exact: true })).not.toBeChecked();
    await expect(sheet.getByRole("checkbox", { name: "Socios", exact: true })).toBeDisabled();
    await expect(
      sheet.getByRole("checkbox", { name: "Entrenamiento", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
  });
});
