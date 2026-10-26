import { expect, test, type Page } from "@playwright/test";
import { expectLegibleButtons, login, shot, signOut } from "./helpers";

/**
 * La programación del coach (ADR 0050) en el box de demostración: la semana con su estado, un WOD
 * abierto y uno nuevo hecho con atajos (fuerza al % del 1RM y Fran como WOD), guardado como
 * borrador, publicado y de vuelta en la semana. Escritorio y móvil comparten base: cada uno
 * programa un día distinto de la semana que viene, que la semilla deja sin WOD.
 */
const BOX = "/demo-box";
const PASSWORD = "123456";

/** Día de calendario del club (Europe/Madrid) desplazado `days` días. */
function clubDay(days = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  const at = new Date(`${today}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

function mondayOf(date: string): string {
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

/** Como lo escribe la app: "jueves, 5 de noviembre". */
const longDay = (date: string) =>
  new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

/** Arriba del todo antes de cada captura: la barra fija y la vista previa en su sitio. */
async function capture(page: Page, name: string, project: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, name, project);
}

async function openWeek(page: Page, monday?: string) {
  await page.goto(`${BOX}/programming${monday ? `?week=${monday}` : ""}`);
  await expect(page.getByRole("heading", { level: 1, name: "Programación" })).toBeVisible();
  await expect(page.locator("ol[aria-busy='false']")).toBeVisible();
}

test.describe("programación del coach", () => {
  test("la semana, un WOD abierto y uno nuevo de fuerza al % con Fran, publicado", async ({
    page,
  }, info) => {
    const project = info.project.name;
    // Escritorio programa el jueves de la semana que viene y móvil el viernes: nunca chocan.
    const nextMonday = addDays(mondayOf(clubDay()), 7);
    const target = addDays(nextMonday, project === "movil" ? 4 : 3);

    await login(page, "coach@demo.test", PASSWORD, BOX);

    // La semana: un día por fila, con su WOD y su estado.
    await openWeek(page);
    await expect(
      page.getByRole("button", { name: /Copiar la semana anterior|Más acciones/ }).first(),
    ).toBeVisible();
    const cards = page.locator("ol article h3 a");
    await expect(cards.first()).toBeVisible();
    await capture(page, "290-box-programacion-semana", project);
    await expectLegibleButtons(page);

    // Un WOD de la semana se abre en el editor, con su vista previa.
    await cards.first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Editar WOD" })).toBeVisible();
    await expect(page.getByRole("article", { name: /^Bloque A/ }).first()).toBeVisible();

    // La semana que viene: los días con clase y sin WOD piden programarse.
    await openWeek(page, nextMonday);
    const program = page.getByRole("link", { name: `Programar CrossFit el ${longDay(target)}` });
    await expect(program).toBeVisible();
    await capture(page, "293-box-programacion-dia-vacio", project);

    // Nuevo WOD desde el hueco del día: disciplina y día ya elegidos.
    await program.click();
    await expect(page.getByRole("heading", { level: 1, name: "Nuevo WOD" })).toBeVisible();
    await expect(page.getByText(longDay(target), { exact: false }).first()).toBeVisible();
    // El coach programa en CrossFit y HYROX: la disciplina viene elegida y se puede cambiar.
    await expect(
      page.getByRole("group", { name: "Disciplina" }).getByRole("button", { name: "CrossFit" }),
    ).toHaveAttribute("aria-pressed", "true");
    const addBar = page.getByRole("group", { name: "Añadir bloque" });

    // Fuerza: nace como series al % del 1RM.
    await addBar.getByRole("button", { name: "Fuerza" }).click();
    const strength = page.getByRole("article", { name: "Bloque A: Fuerza" });
    await strength.getByLabel("Título del bloque A").fill("Back squat");
    await strength.getByLabel("Pizarra").fill("5 x 5 cada 2:30");
    await expect(strength.getByRole("button", { name: "Series al % del 1RM" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await strength.getByLabel("Movimiento").selectOption({ label: "Back squat" });
    await strength.getByLabel("% del 1RM").fill("75");

    // WOD: Fran, del catálogo de benchmarks.
    await addBar.getByRole("button", { name: "WOD" }).click();
    const wod = page.getByRole("article", { name: "Bloque B: WOD" });
    await wod.getByRole("button", { name: "Usar un benchmark" }).click();
    const sheet = page.getByRole("dialog", { name: "Usar un benchmark" });
    await sheet.getByRole("button", { name: /^Fran/ }).click();
    await expect(sheet).toHaveCount(0);
    await expect(wod.getByLabel("Título del bloque B")).toHaveValue("Fran");
    await expect(wod.getByRole("button", { name: "Por tiempo" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText("Cambios sin guardar")).toBeHidden();
    await capture(page, "291-box-programacion-editor", project);

    // Borrador: solo lo ve el equipo.
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(page.getByText("Borrador guardado.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Editar WOD" })).toBeVisible();
    await expect(page.getByText("Solo lo ve el equipo del box.", { exact: true })).toBeVisible();

    // Publicar: los atletas ya lo ven.
    await page.getByRole("button", { name: "Publicar", exact: true }).click();
    await expect(page.getByText("WOD publicado: los atletas ya lo ven.")).toBeVisible();
    await expect(page.getByText("Los atletas ya lo ven.", { exact: true })).toBeVisible();
    // Sin avisos encima para la captura.
    await expect(page.getByText("WOD publicado: los atletas ya lo ven.")).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByText("Borrador guardado.")).toBeHidden({ timeout: 15_000 });

    // Así lo ve el atleta: en móvil, en su pestaña.
    if (project === "movil") {
      await page.getByRole("button", { name: "Vista previa" }).click();
    }
    const preview = page.getByRole("complementary", { name: "Así lo ve el atleta" });
    await expect(preview.getByText("Fran").first()).toBeVisible();
    await expect(preview.getByText("Back squat").first()).toBeVisible();
    await capture(page, "292-box-programacion-vista-previa", project);

    // De vuelta en la semana, publicado y con sus bloques.
    await openWeek(page, nextMonday);
    const day = page.locator("ol[aria-busy] > li").nth(project === "movil" ? 4 : 3);
    await expect(day.getByText("Publicado", { exact: true })).toBeVisible();
    await expect(day.getByText(/Back squat/).first()).toBeVisible();
    await expect(day.getByText(/Fran/).first()).toBeVisible();
    await signOut(page);
  });
});
