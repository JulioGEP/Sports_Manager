import { expect, test } from "@playwright/test";
import { CLUB, expectLegibleButtons, login, shot, suffix } from "./helpers";

/** Fecha de hoy en formato ISO (`YYYY-MM-DD`), para crear eventos en la semana que se ve. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * El club completo (Bloques 15 a 18, ADR 0031): socios con tipos, agenda con eventos e
 * instalaciones con horario, cuotas con cargos y planes, los ajustes nuevos y lo que ve una familia.
 * Las páginas que en móvil viven en "Más" se abren por su ruta.
 */
test.describe("club completo", () => {
  test("socios: lista, alta y ficha", async ({ page }, info) => {
    const sfx = suffix(info.project.name);
    await login(page);
    await page.goto(`${CLUB}/club-members`);
    await expect(page.getByRole("heading", { name: "Socios" })).toBeVisible();
    const laura = page.locator("tr, li").filter({ hasText: "Laura Martí" }).first();
    await expect(laura).toBeVisible();
    await expect(laura.getByText("Socio familiar")).toBeVisible();
    await shot(page, "90-socios", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("button", { name: "Nuevo socio" }).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: "Nuevo socio" })).toBeVisible();
    await sheet.getByLabel("Nombre", { exact: true }).fill("Pere");
    await sheet.getByLabel("Apellidos").fill(`Prueba ${sfx}`);
    await sheet.getByLabel("Tipo de socio").selectOption({ label: "Socio" });
    await shot(page, "91-socio-nuevo", info.project.name);
    await sheet.getByRole("button", { name: "Dar de alta" }).click();
    await expect(page.getByText(`Pere Prueba ${sfx} ya es socio del club.`)).toBeVisible();
    await expect(page.getByText(`Pere Prueba ${sfx}`).first()).toBeVisible();

    // La ficha de una socia que además es familia: persona, socio, papeles y cuotas.
    await page.goto(`${CLUB}/club-members`);
    await page
      .locator("tr, li")
      .filter({ hasText: "Laura Martí" })
      .getByRole("link", { name: "Abrir" })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Laura Martí" })).toBeVisible();
    await expect(page.getByText(/Socio nº \d+ · Socio familiar/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Papeles en el club" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cuotas" })).toBeVisible();
    await shot(page, "92-socio-ficha", info.project.name);
    await expectLegibleButtons(page);
  });

  test("agenda: la semana del club, un evento nuevo y el detalle", async ({ page }, info) => {
    const sfx = suffix(info.project.name);
    await login(page);
    await page.goto(`${CLUB}/agenda`);
    await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Entrenamiento/ }).first()).toBeVisible();
    await shot(page, "93-agenda", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("button", { name: "Nuevo evento" }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Tipo").selectOption("meeting");
    await sheet.getByLabel("Título").fill(`Reunión de familias ${sfx}`);
    await sheet.getByLabel("Fecha").fill(todayIso());
    await sheet.getByLabel("Empieza").fill("21:00");
    await sheet.getByLabel("Acaba").fill("22:00");
    await sheet.getByLabel("Instalación").selectOption({ label: "Sala polivalente" });
    await shot(page, "94-agenda-evento-nuevo", info.project.name);
    await sheet.getByRole("button", { name: "Guardar evento" }).click();
    // Escritorio y móvil comparten base: el segundo aviso dice que la sala ya estaba ocupada.
    await expect(page.getByText(/Evento creado\.|Se ha guardado igual\./)).toBeVisible();
    await expect(page.getByText(`Reunión de familias ${sfx}`).first()).toBeVisible();

    // El detalle de un entrenamiento: equipo, instalación y pase de lista.
    await page
      .getByRole("button", { name: /Entrenamiento/ })
      .first()
      .click();
    const detail = page.getByRole("dialog");
    await expect(detail.getByText("Instalación", { exact: true })).toBeVisible();
    await shot(page, "95-agenda-evento", info.project.name);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("instalaciones: lista y ficha con horas de apertura", async ({ page }, info) => {
    await login(page);
    await page.goto(`${CLUB}/facilities`);
    await expect(page.getByRole("heading", { name: "Instalaciones" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Pabellón pista 1/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Piscina 25 m/ })).toBeVisible();
    await shot(page, "96-instalaciones", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("link", { name: /Piscina 25 m/ }).click();
    await expect(page.getByRole("heading", { name: /Piscina 25 m/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Horas de apertura" })).toBeVisible();
    await shot(page, "97-instalacion-ficha", info.project.name);
    await expectLegibleButtons(page);
  });

  test("cuotas: cargos, planes, cobro y ajustes del club", async ({ page }, info) => {
    const sfx = suffix(info.project.name);
    await login(page);
    await page.goto(`${CLUB}/fees`);
    await expect(page.getByRole("heading", { name: "Cuotas" })).toBeVisible();
    await expect(page.getByText(/Pendiente \(\d+ cargos?\)/)).toBeVisible();
    await expect(page.getByText("Cuota de socio").first()).toBeVisible();
    await shot(page, "98-cuotas-cargos", info.project.name);
    await expectLegibleButtons(page);

    // Registrar un pago a mano sobre el primer cargo abierto.
    await page.getByRole("button", { name: "Cobrar" }).first().click();
    const pay = page.getByRole("dialog");
    await expect(pay.getByRole("heading", { name: "Registrar pago" })).toBeVisible();
    await shot(page, "98b-cuotas-cobrar", info.project.name);
    await pay.getByRole("button", { name: "Registrar" }).click();
    await expect(page.getByText("Pago registrado.")).toBeVisible();

    await page.getByRole("tab", { name: "Planes" }).click();
    await expect(page.getByRole("tab", { name: "Planes" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("Cuota de fútbol sala", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Abono de piscina", { exact: true }).first()).toBeVisible();
    await shot(page, "98c-cuotas-planes", info.project.name);

    // Ajustes: cobros, temporadas, tipos de socio y puesta en marcha.
    await page.goto(`${CLUB}/settings?tab=payments`);
    await expect(page.getByRole("heading", { name: "Cómo cobra el club" })).toBeVisible();
    await expect(page.getByText("Claves de Stripe en la plataforma")).toBeVisible();
    await shot(page, "99-ajustes-cobros", info.project.name);
    await expectLegibleButtons(page);

    await page.goto(`${CLUB}/settings?tab=seasons`);
    await expect(page.getByRole("heading", { name: "Temporadas" })).toBeVisible();
    await expect(page.getByText("2026-27").first()).toBeVisible();
    await page.getByRole("button", { name: "Nueva temporada" }).first().click();
    const seasonSheet = page.getByRole("dialog");
    await seasonSheet.getByLabel("Nombre", { exact: true }).fill(`2027-28 ${sfx}`);
    await seasonSheet.getByLabel("Empieza").fill("2027-09-01");
    await seasonSheet.getByLabel("Acaba").fill("2028-06-30");
    await shot(page, "33-temporada-nueva", info.project.name);
    await seasonSheet.getByRole("button", { name: "Crear temporada" }).click();
    await expect(page.getByText("Temporada creada.")).toBeVisible();
    await expect(page.getByText(`2027-28 ${sfx}`)).toBeVisible();

    await page.goto(`${CLUB}/settings?tab=memberTypes`);
    await expect(page.getByRole("heading", { name: "Tipos de socio" }).first()).toBeVisible();
    await expect(page.getByText("Abonado piscina").first()).toBeVisible();
    await shot(page, "99b-ajustes-tipos-socio", info.project.name);

    await page.goto(`${CLUB}/settings?tab=setup`);
    await expect(page.getByRole("heading", { name: "Puesta en marcha" })).toBeVisible();
    await shot(page, "99c-ajustes-puesta-en-marcha", info.project.name);
  });

  test("la familia ve su agenda y sus cuotas", async ({ page }, info) => {
    await login(page, "familia@demo.test");
    await page.goto(`${CLUB}/agenda`);
    await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
    await expect(page.getByText("Lo que tienen tus hijos esta semana.")).toBeVisible();
    await shot(page, "99d-familia-agenda", info.project.name);
    await expectLegibleButtons(page);

    await page.goto(`${CLUB}/fees`);
    await expect(page.getByRole("heading", { name: "Mis cuotas" })).toBeVisible();
    await expect(page.getByText(/Pendiente|Nada pendiente/).first()).toBeVisible();
    await expect(
      page.getByText("El club apunta los pagos a mano: paga por transferencia o en secretaría"),
    ).toBeVisible();
    await shot(page, "99e-familia-cuotas", info.project.name);
    await expectLegibleButtons(page);
    // Lo que no es suyo no abre.
    await page.goto(`${CLUB}/club-members`);
    await expect(page.getByRole("heading", { name: "Socios" })).toHaveCount(0);
  });
});
