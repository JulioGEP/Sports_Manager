import { expect, test, type Page } from "@playwright/test";
import { expectLegibleButtons, login, shot, signOut } from "./helpers";

/**
 * Clubs de fitness (ADR 0049) sobre el box de demostración (`/demo-box`): la atleta reserva, mira el
 * WOD, su progreso y su tarifa; el coach da sus clases y programa; la dueña mira y elige las cifras
 * de Hoy y de cada área (ADR 0055), lleva el horario, las tarifas y los leads, y pone la pantalla
 * del box. Una captura de cada pantalla.
 */
const BOX = "/demo-box";
const PASSWORD = "123456";

async function open(page: Page, path: string, heading: string | RegExp) {
  await page.goto(`${BOX}${path}`);
  await expect(page.getByRole("heading", { level: 1, name: heading }).first()).toBeVisible();
}

test.describe("box de demostración", () => {
  test("la atleta: su día, reservar, la clase, el WOD, la clasificación y su progreso", async ({
    page,
  }, info) => {
    await login(page, "atleta@demo.test", PASSWORD, BOX);
    await expect(page.getByRole("heading", { level: 1, name: /Laia/ })).toBeVisible();
    // Nada de club deportivo: ni secciones, ni deportistas, ni familia.
    await expect(page.getByRole("link", { name: "Secciones" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Mi familia" })).toHaveCount(0);
    if (info.project.name === "escritorio") {
      for (const name of ["Reservar", "WOD", "Progreso", "Mi tarifa"])
        await expect(page.getByRole("link", { name, exact: true }).first()).toBeVisible();
    }
    await shot(page, "240-box-atleta-inicio", info.project.name);
    await expectLegibleButtons(page);

    // Reservar es un calendario (ADR 0051): la semana en escritorio, el día en el móvil.
    await open(page, "/classes", "Reservar");
    await expect(page.locator("li[data-class-id]").first()).toBeVisible();
    await shot(page, "241-box-atleta-reservar", info.project.name);
    await expectLegibleButtons(page);
    // Tocar una clase abre su panel con la reserva; la ficha completa, desde ahí. Mejor una con
    // plazas libres (según la hora a la que corre la prueba puede que no quede ninguna).
    const bookable = page.locator("li[data-class-id] button", { hasText: /libres/ });
    const anyClass = page.locator("li[data-class-id] button");
    await ((await bookable.count()) > 0 ? bookable : anyClass).first().click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await shot(page, "241b-box-atleta-reservar-panel", info.project.name);
    await panel.getByRole("link", { name: "Ver la clase" }).click();
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await shot(page, "242-box-atleta-clase", info.project.name);

    await open(page, "/wod", "WOD");
    await shot(page, "243-box-atleta-wod", info.project.name);
    await expectLegibleButtons(page);
    const board = page.getByRole("link", { name: /clasificación/i }).first();
    if (await board.count()) {
      await board.click();
      await expect(page.getByRole("heading", { level: 1, name: /Clasificación/ })).toBeVisible();
      await shot(page, "244-box-atleta-clasificacion", info.project.name);
    }

    await open(page, "/progress", "Progreso");
    await expect(page.getByText(/back squat/i).first()).toBeVisible();
    await shot(page, "245-box-atleta-progreso", info.project.name);
    await expectLegibleButtons(page);

    await open(page, "/my-plan", "Mi tarifa");
    await expect(page.getByText("Ilimitada").first()).toBeVisible();
    await shot(page, "246-box-atleta-tarifa", info.project.name);

    await open(page, "/messages", "Mensajes");
    await expect(page.getByText(/molestias en el hombro/).first()).toBeVisible();
    await shot(page, "247-box-atleta-mensajes", info.project.name);

    await open(page, "/announcements", "Anuncios");
    // Los de todo el box; el de HYROX no, porque Laia no va a HYROX.
    await expect(page.getByText("Inscripciones para el Open").first()).toBeVisible();
    await expect(page.getByText("Nueva clase de HYROX los sábados")).toHaveCount(0);
    await shot(page, "248-box-atleta-anuncios", info.project.name);

    // El timer y el ranking ya no existen (ADR 0055): sus enlaces de siempre llevan al inicio.
    await expect(page.getByRole("link", { name: "Timer" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Ranking" })).toHaveCount(0);
    for (const gone of ["/timer", "/ranking"]) {
      await page.goto(`${BOX}${gone}`);
      await expect(page.getByRole("heading", { level: 1, name: /Laia/ })).toBeVisible();
    }
    await signOut(page);
  });

  test("el coach: sus clases con check-in, la programación y sus atletas", async ({
    page,
  }, info) => {
    await login(page, "coach@demo.test", PASSWORD, BOX);
    await expect(page.getByRole("heading", { level: 1, name: /Álex/ })).toBeVisible();
    await shot(page, "255-box-coach-inicio", info.project.name);
    await expectLegibleButtons(page);

    await open(page, "/classes", "Clases");
    await expect(page.locator("li[data-class-id]").first()).toBeVisible();
    await shot(page, "256-box-coach-clases", info.project.name);
    await page.locator("li[data-class-id] a").first().click();
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await shot(page, "257-box-coach-clase", info.project.name);
    await expectLegibleButtons(page);

    await open(page, "/programming", "Programación");
    await shot(page, "258-box-coach-programacion", info.project.name);
    await expectLegibleButtons(page);

    await page.goto(`${BOX}/programming/new`);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await shot(page, "259-box-coach-editor", info.project.name);

    await open(page, "/athletes", "Atletas");
    await expect(page.getByText("Laia Ferrer").first()).toBeVisible();
    await shot(page, "260-box-coach-atletas", info.project.name);
    await page.getByText("Laia Ferrer").first().click();
    await expect(page.getByRole("heading", { level: 1, name: /Laia Ferrer/ })).toBeVisible();
    await shot(page, "261-box-coach-ficha", info.project.name);

    await open(page, "/messages", "Mensajes");
    await shot(page, "262-box-coach-mensajes", info.project.name);

    // El coach ve Entrenamiento con sus cifras, sin elegirlas y sin nada de dinero.
    await open(page, "/areas/training", "Entrenamiento");
    await expect(page.locator("[data-kpi]").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Elegir KPIs" })).toHaveCount(0);
    await shot(page, "263-box-coach-area-entrenamiento", info.project.name);
    await signOut(page);
  });

  test("la dueña: cifras, áreas con KPIs, horario, tarifas, leads y la pantalla del box", async ({
    page,
  }, info) => {
    await login(page, "box@demo.test", PASSWORD, BOX);
    await expect(page.getByRole("heading", { level: 1, name: /Marta/ })).toBeVisible();
    // Hoy enseña de serie atletas, ocupación, recurrente y pruebas (ADR 0055).
    await expect(page.locator('[data-kpi="active_athletes"]')).toBeVisible();
    await expect(page.locator('[data-kpi="recurring_revenue"]')).toBeVisible();
    await shot(page, "265-box-duena-inicio", info.project.name);
    await expectLegibleButtons(page);

    // Elegir los KPIs de Hoy: los que salen, en orden, y los que se pueden añadir con su cifra.
    await page.getByRole("button", { name: "Elegir KPIs" }).first().click();
    const editor = page.getByRole("dialog");
    await expect(editor.getByRole("heading", { name: "KPIs de Hoy" })).toBeVisible();
    await expect(editor.getByRole("button", { name: /^Añadir / }).first()).toBeVisible();
    await shot(page, "265a-box-duena-elegir-kpis", info.project.name);
    await editor.getByRole("button", { name: "Cancelar" }).last().click();

    // Las cabeceras de la barra abren la portada de cada área.
    if (info.project.name === "escritorio") {
      await page.getByRole("link", { name: "Resumen de Entrenamiento" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Entrenamiento" })).toBeVisible();
      for (const name of ["Clases", "Programación", "Atletas", "Planificación", "Ejercicios"])
        await expect(page.getByRole("link", { name, exact: true }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Métricas" })).toHaveCount(0);
    } else {
      await open(page, "/areas/training", "Entrenamiento");
    }
    await expect(page.locator("[data-kpi]").first()).toBeVisible();
    await shot(page, "265d-box-duena-area-entrenamiento", info.project.name);
    await expectLegibleButtons(page);

    // En el móvil, "Más" agrupa por áreas y cada cabecera abre su portada.
    if (info.project.name === "movil") {
      await page.getByRole("button", { name: "Más" }).click();
      const more = page.getByRole("dialog");
      await expect(more.getByRole("link", { name: "Resumen de Negocio" })).toBeVisible();
      await shot(page, "265e-box-duena-mas", info.project.name);
      await more.getByRole("link", { name: "Resumen de Negocio" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Negocio" })).toBeVisible();
    }

    // Métricas pasa a ser la portada de Negocio.
    await page.goto(`${BOX}/metrics`);
    await expect(page.getByRole("heading", { level: 1, name: "Negocio" })).toBeVisible();
    await expect(page.locator('[data-kpi="recurring_revenue"]')).toBeVisible();
    await shot(page, "269-box-duena-area-negocio", info.project.name);

    await open(page, "/areas/box", "El box");
    await expect(page.getByRole("heading", { name: "Ocupación por franja" })).toBeVisible();
    await shot(page, "269b-box-duena-area-el-box", info.project.name);

    // La dueña ve todo el box en el calendario; tocar un día lo abre en la vista de día.
    await open(page, "/classes", "Clases");
    await expect(page.locator("li[data-class-id]").first()).toBeVisible();
    await shot(page, "265b-box-duena-clases", info.project.name);
    await expectLegibleButtons(page);
    if (info.project.name === "escritorio") {
      await page
        .getByRole("button", { name: /^Ver el / })
        .first()
        .click();
      await expect(page.getByRole("tab", { selected: true })).toBeVisible();
      await shot(page, "265c-box-duena-clases-dia", info.project.name);
    }

    await open(page, "/class-types", "Horario");
    await expect(page.getByText("Open Box").first()).toBeVisible();
    await shot(page, "266-box-duena-horario", info.project.name);
    await expectLegibleButtons(page);

    await open(page, "/plans", "Tarifas");
    await expect(page.getByText("Bono 10 sesiones").first()).toBeVisible();
    await shot(page, "267-box-duena-tarifas", info.project.name);
    await expectLegibleButtons(page);

    await open(page, "/leads", "Leads");
    await expect(page.getByText("Nora").first()).toBeVisible();
    await shot(page, "268-box-duena-leads", info.project.name);

    await page.goto(`${BOX}/settings?tab=identity`);
    await expect(page.getByText("Looks de box")).toBeVisible();
    await shot(page, "270-box-duena-identidad", info.project.name);

    await page.goto(`${BOX}/tv`);
    await expect(page.getByRole("button", { name: /salir/i }).first()).toBeVisible();
    await shot(page, "271-box-pantalla", info.project.name);
    await page.goto(BOX);
    await signOut(page);
  });

  test("la plataforma ve el tipo de cada club y lo cambia", async ({ page }, info) => {
    await login(page, "admin@demo.test", PASSWORD, "/admin");
    await page.goto("/admin/clubs/demo-box");
    await expect(page.getByText("Tipo de club").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Club de fitness" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await shot(page, "272-plataforma-tipo-de-club", info.project.name);
  });
});
