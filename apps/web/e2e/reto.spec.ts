import { expect, test } from "@playwright/test";
import { CLUB, expectLegibleButtons, login, shot, signOut, suffix } from "./helpers";

/**
 * Bloque 13 (ADR 0030): reto por puntos con validación, inicio operativo, paneles por cargo y
 * permisos por equipo, con el club demo precargado (reto activo con registros de la familia Martí).
 */
test.describe("reto por puntos y paneles del personal", () => {
  test("la administración gestiona el reto, valida un registro y ve la participación", async ({
    page,
  }, info) => {
    const sfx = suffix(info.project.name);
    await login(page);
    // El inicio operativo: alertas, preparación de las fichas y accesos rápidos.
    await expect(page.getByRole("heading", { name: "Alertas del club" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Preparación de las fichas" })).toBeVisible();
    await expect(page.getByText(/registros? del reto por validar/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Últimos movimientos" })).toBeVisible();
    await shot(page, "03b-inicio-operativo", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("link", { name: "Reto" }).first().click();
    await expect(page.getByRole("heading", { name: "Retos" })).toBeVisible();
    await expect(page.getByText("Reto de hábitos 2026-27").first()).toBeVisible();
    await shot(page, "70-retos", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("link", { name: "Abrir" }).first().click();
    await expect(page.getByRole("heading", { name: /Reto de hábitos 2026-27/ })).toBeVisible();
    await expect(page.getByText("Entrenamiento completo").first()).toBeVisible();
    await shot(page, "71-reto-pruebas", info.project.name);
    await expectLegibleButtons(page);

    // Nueva prueba en el catálogo: valoración de 1 a 5, sin tope, un punto por punto.
    await page.getByRole("button", { name: "Nueva prueba" }).click();
    const taskSheet = page.getByRole("dialog");
    await taskSheet.getByLabel("Nombre", { exact: true }).fill(`Estiramientos ${sfx}`);
    await taskSheet.getByLabel("Área").selectOption("habits");
    await taskSheet.getByLabel("Tipo").selectOption("rating");
    await taskSheet.getByLabel("Puntos por unidad").fill("1");
    await shot(page, "71b-reto-prueba-nueva", info.project.name);
    await taskSheet.getByRole("button", { name: "Crear prueba" }).click();
    await expect(page.getByText(`Prueba Estiramientos ${sfx} creada.`)).toBeVisible();
    await expect(page.getByText(`Estiramientos ${sfx}`).first()).toBeVisible();

    // Validación: la cola de registros pendientes; se aprueba el primero.
    await page.getByRole("tab", { name: /Validación/ }).click();
    await expect(page.getByText("Marc Martí").first()).toBeVisible();
    await expect(page.getByText("Lectura").first()).toBeVisible();
    await shot(page, "72-reto-validacion", info.project.name);
    await expectLegibleButtons(page);
    await page.getByRole("button", { name: "Aprobar" }).first().click();
    await expect(page.getByText(/Registro de .+ aprobado: \+\d+\./)).toBeVisible();

    // Participación: solo para el personal, con los puntos aprobados.
    await page.getByRole("tab", { name: /Participación/ }).click();
    await expect(page.getByText("Clara Martí").first()).toBeVisible();
    await expect(page.getByText("Mínimo cumplido").first()).toBeHidden();
    await shot(page, "73-reto-participacion", info.project.name);
    await expectLegibleButtons(page);
    await signOut(page);
  });

  test("la familia registra actividad y ve solo sus puntos", async ({ page }, info) => {
    const sfx = suffix(info.project.name);
    await login(page, "familia@demo.test");
    await page.getByRole("link", { name: "Reto" }).first().click();
    await expect(page.getByRole("heading", { name: "Reto" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Clara Martí" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("Reto de hábitos 2026-27").first()).toBeVisible();
    // Sus puntos y el mínimo del reto; la participación del club no existe para la familia.
    await expect(page.getByText("Mínimo 50")).toBeVisible();
    await expect(page.getByRole("tab", { name: /Participación/ })).toHaveCount(0);
    await shot(page, "74-familia-reto", info.project.name);
    await expectLegibleButtons(page);

    // Registra la prueba que acaba de crear la administración (sin tope: siempre 4 puntos).
    await page.getByRole("button", { name: "Registrar actividad" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Prueba").selectOption({ label: `Estiramientos ${sfx}` });
    await sheet.getByLabel("Valoración").selectOption("4");
    await sheet.getByLabel("Nota o enlace").fill("Cuatro sesiones esta semana");
    await shot(page, "74b-familia-reto-registrar", info.project.name);
    await sheet.getByRole("button", { name: "Añadir 4 puntos" }).click();
    await expect(page.getByText("Actividad registrada. El club la validará.")).toBeVisible();
    await expect(page.getByText(`Estiramientos ${sfx}`).first()).toBeVisible();
    await expect(page.getByText(/\d+ por validar/).first()).toBeVisible();

    // Marc tiene su propia pestaña con sus puntos.
    await page.getByRole("tab", { name: "Marc Martí" }).click();
    await expect(page.getByText("Lectura").first()).toBeVisible();
    await signOut(page);
  });

  test("dirección y fisioterapia entran con su cargo y ven su panel", async ({ page }, info) => {
    await login(page, "director@demo.test");
    await expect(page.getByText("Hola, Jordi")).toBeVisible();
    await expect(page.getByText("Director deportivo").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Seguimiento del club" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Alertas del club" })).toBeVisible();
    await shot(page, "75-director-inicio", info.project.name);
    await expectLegibleButtons(page);
    // La dirección escribe estructura: ve el botón de nueva sección.
    await page.getByRole("link", { name: "Secciones" }).first().click();
    await expect(page.getByRole("button", { name: "Nueva sección" })).toBeVisible();
    await signOut(page);

    await login(page, "fisio@demo.test");
    await expect(page.getByText("Hola, Núria")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Seguimiento físico" })).toBeVisible();
    await expect(page.getByText(/Cuerpo: \d+ de \d+ valorados/)).toBeVisible();
    await shot(page, "76-fisio-inicio", info.project.name);
    await expectLegibleButtons(page);
    // La fisio valora, pero no da de alta jugadores.
    await page.getByRole("link", { name: "Deportistas" }).first().click();
    await expect(page.getByRole("heading", { name: "Deportistas" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nuevo jugador" })).toHaveCount(0);
    await page.getByRole("link", { name: "Clara Martí" }).click();
    await expect(page.getByRole("button", { name: "Valorar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar perfil" })).toHaveCount(0);
    await signOut(page);
  });

  test("miembros: cargo y equipo de cada persona, e invitación de personal con cargo", async ({
    page,
  }, info) => {
    const email = `fisio-${suffix(info.project.name)}@demo.test`;
    await login(page);
    await page.goto(`${CLUB}/members`);
    await expect(page.getByText("Director deportivo").first()).toBeVisible();
    await expect(page.getByText("Fisioterapia").first()).toBeVisible();
    // En escritorio el equipo es un enlace; en móvil, texto en la fila cápsula.
    await expect(page.getByText("Alevín A").first()).toBeVisible();
    await shot(page, "10b-miembros-cargos", info.project.name);

    await page.getByRole("button", { name: "Invitar" }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Email", { exact: true }).fill(email);
    await sheet.getByLabel("Rol").selectOption("staff");
    await sheet.getByLabel("Cargo").selectOption("psychologist");
    await sheet.getByLabel("Equipo").selectOption({ label: "Infantil A" });
    await shot(page, "11b-miembros-invitar-personal", info.project.name);
    await sheet.getByRole("button", { name: "Enviar invitación" }).click();
    await expect(page.getByText(`comparte este enlace con ${email}`)).toBeVisible();
    await expect(page.getByText("Psicología").first()).toBeVisible();
    await expect(page.getByText("Infantil A").first()).toBeVisible();
  });
});
