import { expect, test, type Page } from "@playwright/test";
import { expectLegibleButtons, login, shot } from "./helpers";

/**
 * La planificación del box (ADR 0053) en el box de demostración, que llega con "Camino al Open" en
 * su semana 5, un plan terminado para calibrar y dos planes propios (ADR 0054): uno solo para Carla
 * y otro para el grupo de competición, con su cuota de programación. La dueña ve el plan, el mapa
 * del ciclo, la semana con su validación, la revisión del domingo, la salud, el material, el
 * asistente de un plan nuevo hasta el resumen (sin crearlo), un grupo nuevo en el que Carla ya
 * tiene plan propio y el grupo de competición con sus atletas; el coach escribe un WOD desde la
 * semana; la atleta ve el plan en su WOD, su ciclo y su ciclo en cifras.
 */
const BOX = "/demo-box";
const PASSWORD = "123456";

async function capture(page: Page, name: string, project: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, name, project);
}

test.describe("planificación del box", () => {
  test("la dueña: planes, mapa, semana, revisión, salud y material", async ({ page }, info) => {
    const project = info.project.name;
    await login(page, "box@demo.test", PASSWORD, BOX);

    await page.goto(`${BOX}/planning`);
    await expect(page.getByRole("heading", { level: 1, name: "Planificación" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Camino al Open/ })).toBeVisible();
    await expect(page.getByText(/semana 5 de \d+/)).toBeVisible();
    await capture(page, "300-box-planificacion", project);
    await expectLegibleButtons(page);

    // El plan: dónde está el box, el mapa del ciclo y lo que se puede esperar.
    await page.getByRole("link", { name: "Abrir el plan" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Camino al Open" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mapa del ciclo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lo que se puede esperar" })).toBeVisible();
    await capture(page, "301-box-plan-mapa", project);

    // La semana en curso: cada día con su papel, su WOD y lo que dice el validador.
    await page.getByRole("link", { name: "Abrir esta semana" }).click();
    await expect(page.getByRole("tab", { name: "Semana", selected: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Equilibrio de la semana" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Quien viene 2 o 3 días" })).toBeVisible();
    await capture(page, "302-box-plan-semana", project);
    await page.getByRole("button", { name: "Comprobaciones del validador" }).first().click();
    await expect(page.getByText(/^Tiempo: /).first()).toBeVisible();

    // La revisión del domingo: lo previsto frente a lo que pasó y los ajustes.
    await page.getByRole("tab", { name: "Revisión" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Revisión del domingo" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Día a día" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ajustes para la semana que viene" }),
    ).toBeVisible();
    await capture(page, "303-box-plan-revision", project);

    // La salud de la programación.
    await page.getByRole("tab", { name: "Salud" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Salud de la programación" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Patrones por semana" })).toBeVisible();
    await capture(page, "304-box-plan-salud", project);

    // El material de la sala, con el remo en reparación.
    await page.goto(`${BOX}/equipment`);
    await expect(page.getByRole("heading", { level: 1, name: "Material del box" })).toBeVisible();
    await expect(page.getByText("Remo", { exact: true })).toBeVisible();
    await expect(page.getByText(/1 en reparación/)).toBeVisible();
    await capture(page, "305-box-material", project);
  });

  test("la dueña: el asistente de un plan nuevo hasta el resumen", async ({ page }, info) => {
    const project = info.project.name;
    await login(page, "box@demo.test", PASSWORD, BOX);
    await page.goto(`${BOX}/planning/new`);
    await expect(page.getByRole("heading", { level: 1, name: "Nuevo plan" })).toBeVisible();
    // Para todo el box, y CrossFit ya tiene un plan activo: el nuevo lo sustituye o va en borrador.
    await expect(page.getByRole("button", { name: /Todo el box/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText(/ya tiene un plan activo: Camino al Open/)).toBeVisible();
    const next = page.getByRole("button", { name: "Siguiente", exact: true });
    await next.click();
    await page.getByRole("button", { name: /Base de fuerza/ }).click();
    await expect(page.getByRole("heading", { name: "Lo que puedes esperar" })).toBeVisible();
    await capture(page, "306-box-plan-nuevo-objetivo", project);

    await next.click();
    await expect(page.getByLabel("Nombre del plan")).toHaveValue("Base de fuerza");
    await next.click();
    await expect(page.getByText("100 de 100 puntos")).toBeVisible();
    await capture(page, "307-box-plan-nuevo-enfasis", project);
    await next.click();
    await expect(page.getByRole("checkbox", { name: /Back squat 1RM/ })).toBeChecked();
    await next.click();
    await expect(page.getByRole("heading", { name: "Lo que ya sabe tu box" })).toBeVisible();
    await expect(page.getByText(/Clases los /)).toBeVisible();
    await capture(page, "308-box-plan-nuevo-tu-box", project);
    await next.click();
    await expect(page.getByRole("button", { name: "Crear el plan" })).toBeVisible();
    await expect(page.getByText("Activarlo y terminar Camino al Open")).toBeVisible();
    await capture(page, "309-box-plan-nuevo-resumen", project);
  });

  test("la dueña: un grupo nuevo en el que Carla ya tiene plan propio", async ({ page }, info) => {
    const project = info.project.name;
    await login(page, "box@demo.test", PASSWORD, BOX);
    await page.goto(`${BOX}/planning/new`);
    await page.getByRole("button", { name: /Un grupo/ }).click();
    await page.getByLabel("Nombre del grupo").fill("Mañanas");
    const next = page.getByRole("button", { name: "Siguiente", exact: true });

    // Carla ya sigue "Carla · Halterofilia": se avisa y no se sigue hasta decidir.
    const search = page.getByLabel("Añadir atletas");
    await search.fill("Carla");
    await page.getByRole("button", { name: /Carla Prieto/ }).click();
    await search.fill("Laia");
    await page.getByRole("button", { name: /Laia Ferrer/ }).click();
    await expect(page.getByText("1 atleta ya sigue un plan propio")).toBeVisible();
    await expect(next).toBeDisabled();
    await capture(page, "318-box-plan-nuevo-para-quien", project);

    await page.getByRole("button", { name: "Anular el suyo" }).click();
    await expect(page.getByText("Deja Carla · Halterofilia")).toBeVisible();
    await expect(next).toBeEnabled();
    // Y se puede quitar a cualquiera del grupo.
    await page.getByRole("button", { name: "Quitar a Laia Ferrer" }).click();
    await expect(page.getByText("1 atleta", { exact: true })).toBeVisible();
    await expectLegibleButtons(page);
  });

  test("la dueña: el grupo de competición con sus atletas y su cuota", async ({ page }, info) => {
    const project = info.project.name;
    await login(page, "box@demo.test", PASSWORD, BOX);
    await page.goto(`${BOX}/planning`);
    await expect(page.getByRole("heading", { name: "Planes propios" })).toBeVisible();
    await page.getByRole("button", { name: /Grupo competición/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Grupo competición" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sus 5 atletas" })).toBeVisible();
    await expect(page.getByText("Cuota vencida")).toBeVisible();
    await expect(page.getByText("Sin cuota", { exact: true })).toBeVisible();
    await capture(page, "319-box-plan-propio-atletas", project);

    await page.getByRole("button", { name: "Cambiar atletas" }).click();
    await expect(page.getByRole("button", { name: "Quitar a Núria Casals" })).toBeVisible();
    await shot(page, "320-box-plan-propio-cambiar-atletas", project);
  });

  test("el coach escribe un día desde la semana del plan, con su papel", async ({ page }, info) => {
    const project = info.project.name;
    await login(page, "coach@demo.test", PASSWORD, BOX);
    await page.goto(`${BOX}/programming`);
    await expect(page.getByRole("heading", { level: 1, name: "Programación" })).toBeVisible();
    await expect(page.getByText("Camino al Open").first()).toBeVisible();
    await page.getByRole("link", { name: "Semana del plan" }).first().click();
    await expect(page.getByRole("heading", { name: "Equilibrio de la semana" })).toBeVisible();

    // Un WOD del plan se abre en el editor con su intención.
    await page
      .locator("ol li a[href*='/programming/']:not([href*='/programming/new'])")
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Editar WOD" })).toBeVisible();
    await expect(page.getByText(/Camino al Open · semana/)).toBeVisible();
    await capture(page, "310-box-plan-editor-intencion", project);
  });

  test("la atleta: el plan en su WOD, su ciclo y su ciclo en cifras", async ({ page }, info) => {
    const project = info.project.name;
    await login(page, "atleta@demo.test", PASSWORD, BOX);
    await page.goto(`${BOX}/wod`);
    await expect(page.getByRole("heading", { level: 1, name: "WOD" })).toBeVisible();
    await expect(page.getByText(/Camino al Open · semana 5 de \d+/).first()).toBeVisible();
    await expect(page.getByText("tu versión").first()).toBeVisible();
    await capture(page, "315-box-atleta-wod-plan", project);

    await page.goto(`${BOX}/cycle`);
    await expect(page.getByRole("heading", { level: 1, name: "Tu ciclo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Camino al Open" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tu nivel" })).toBeVisible();
    await capture(page, "316-box-atleta-ciclo", project);
    await expectLegibleButtons(page);

    await page.getByRole("link", { name: "Tu ciclo en cifras" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Tu ciclo en cifras" })).toBeVisible();
    await expect(page.getByText("sesiones", { exact: true })).toBeVisible();
    await capture(page, "317-box-atleta-ciclo-cifras", project);
  });
});
