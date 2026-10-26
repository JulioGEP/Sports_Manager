import { expect, test, type Page } from "@playwright/test";
import { expectLegibleButtons, login, shot } from "./helpers";

/**
 * La planificación del box (ADR 0052) en el box de demostración, que llega con "Camino al Open" en
 * su semana 5 y un plan terminado para calibrar: la dueña ve el plan, el mapa del ciclo, la semana
 * con su validación, la revisión del domingo, la salud, el material y el asistente de un plan nuevo
 * hasta el resumen (sin crearlo); el coach escribe un WOD desde la semana; la atleta ve el plan en
 * su WOD, su ciclo y su ciclo en cifras.
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
    await expect(page.getByText(/semana 5 de 16/)).toBeVisible();
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
    // CrossFit ya tiene un plan activo: el nuevo iría en borrador.
    await expect(page.getByText(/ya tiene un plan activo: Camino al Open/)).toBeVisible();
    await page.getByRole("button", { name: /Base de fuerza/ }).click();
    await expect(page.getByRole("heading", { name: "Lo que puedes esperar" })).toBeVisible();
    await capture(page, "306-box-plan-nuevo-objetivo", project);

    const next = page.getByRole("button", { name: "Siguiente", exact: true });
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
    await capture(page, "309-box-plan-nuevo-resumen", project);
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
    await expect(page.getByText(/Camino al Open · semana 5 de 16/).first()).toBeVisible();
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
