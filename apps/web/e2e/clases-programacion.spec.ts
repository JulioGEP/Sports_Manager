import { expect, test } from "@playwright/test";
import { expectLegibleButtons, login, shot, signOut } from "./helpers";

/**
 * La programación dentro de las clases (ADR 0055) en el box de demostración: cada WOD de la semana
 * dice en qué clases se hace y quién viene, y debajo van los planes propios del día; una clase se
 * abre desde su WOD y enseña de qué plan sale, quién hace qué y la sesión de cada plan propio; y el
 * calendario, en la vista de día, pone al lado la programación del día.
 */
const BOX = "/demo-box";
const PASSWORD = "123456";

test.describe("la programación dentro de las clases", () => {
  test("la dueña ve en cada WOD sus clases y su gente, y en cada clase quién hace qué", async ({
    page,
  }, info) => {
    const project = info.project.name;
    await login(page, "box@demo.test", PASSWORD, BOX);

    // La semana: cada WOD con sus clases, sus reservas y quién viene con plan propio.
    await page.goto(`${BOX}/programming`);
    await expect(page.getByRole("heading", { level: 1, name: "Programación" })).toBeVisible();
    await expect(page.locator("ol[aria-busy='false']")).toBeVisible();
    await expect(page.getByText(/^En \d+ clases?$/).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^Clase de las \d{2}:\d{2}: / }).first(),
    ).toBeVisible();
    // Los planes propios del día, con su sesión y su gente en clase, abren la semana del plan.
    const own = page.getByRole("region", { name: "Planes propios" }).first();
    await expect(own).toBeVisible();
    await expect(own.getByRole("link", { name: /^Abrir la semana de / }).first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, "294-box-programacion-clases", project);
    await expectLegibleButtons(page);

    // Una clase con gente de plan propio, desde su WOD.
    await page
      .getByRole("link", { name: /^Clase de las \d{2}:\d{2}: .*con plan propio/ })
      .first()
      .click();
    const programming = page.getByRole("region", { name: "Programación de la clase" });
    await expect(programming).toBeVisible();
    await expect(programming.getByText(/hacen? el WOD del box$/)).toBeVisible();
    await expect(page.getByText(/^Plan propio: /).first()).toBeVisible();
    await expect(page.getByRole("group", { name: "Qué hace cada uno hoy" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Planes propios" })).toBeVisible();
    await shot(page, "295-box-clase-programacion", project);
    await expectLegibleButtons(page);

    // El calendario en la vista de día: la programación del día al lado (debajo, en el móvil).
    await page.goto(`${BOX}/classes?view=day`);
    await expect(page.locator("li[data-class-id]").first()).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Programación del día" })).toBeVisible();
    await shot(page, "296-box-clases-programacion-del-dia", project);
    await signOut(page);
  });
});
