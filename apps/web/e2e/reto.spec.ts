import { expect, test } from "@playwright/test";
import { CLUB, expectLegibleButtons, login, shot, signOut, suffix } from "./helpers";

/**
 * Bloque 13 (ADR 0030): reto por puntos con validación, inicio operativo, paneles por cargo y
 * permisos por equipo, con el club demo precargado: un reto activo de toda la sección de fútbol
 * sala con registros de la familia Martí y, con ADR 0032, el reto de equipo del Alevín A que lleva
 * su entrenadora.
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

    // El reto no está en la barra (ADR 0032): vive en la ficha de cada sección y de cada equipo.
    await expect(page.getByRole("link", { name: "Reto", exact: true })).toHaveCount(0);
    await page.goto(`${CLUB}/sections`);
    await page.getByRole("link", { name: /Fútbol sala/ }).click();
    await page.getByRole("tab", { name: /Retos/ }).click();
    // Cada reto lleva su ámbito: el de hábitos es de toda la sección; el técnico, solo del Alevín A.
    await expect(page.getByText("Reto de hábitos 2026-27").first()).toBeVisible();
    await expect(page.getByText("Fútbol sala · toda la sección").first()).toBeVisible();
    await expect(page.getByText("Reto técnico del Alevín A").first()).toBeVisible();
    await expect(page.getByText("Fútbol sala · Alevín A").first()).toBeVisible();
    await shot(page, "70-retos", info.project.name);
    await expectLegibleButtons(page);

    // Nuevo reto desde la sección: la sección viene dada; se elige toda la sección o un equipo.
    await page.getByRole("button", { name: "Nuevo reto" }).click();
    const newSheet = page.getByRole("dialog");
    await expect(newSheet.getByLabel("Sección")).toBeDisabled();
    await newSheet.getByLabel("Alcance").selectOption("team");
    await expect(newSheet.getByLabel("Equipo")).toBeVisible();
    await newSheet.getByLabel("Equipo").selectOption({ label: "Infantil A" });
    await shot(page, "70b-reto-nuevo", info.project.name);
    await newSheet.getByRole("button", { name: "Cancelar" }).click();

    // La ficha del equipo: su reto, el de su sección y el histórico, con el seguimiento del equipo.
    await page.getByRole("tab", { name: /Equipos/ }).click();
    await page.getByRole("link", { name: "Alevín A" }).click();
    await expect(page.getByRole("heading", { name: "Alevín A" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reto", exact: true })).toBeVisible();
    await expect(page.getByText("Reto técnico del Alevín A").first()).toBeVisible();
    await expect(page.getByText("Reto de hábitos 2026-27").first()).toBeVisible();
    await shot(page, "70c-equipo-retos", info.project.name);
    await expectLegibleButtons(page);

    // El reto de la sección abierto desde el equipo: la vuelta es al equipo y el seguimiento, del equipo.
    await page.getByRole("link", { name: "Reto de hábitos 2026-27" }).click();
    await expect(page.getByRole("heading", { name: /Reto de hábitos 2026-27/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Equipo Alevín A" })).toBeVisible();
    await expect(page.getByText("Fútbol sala · toda la sección").first()).toBeVisible();
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

    // Validación acotada al equipo desde el que se abrió: Clara (Alevín A) sí; Marc (Benjamín A) no.
    // Con todos los estados, para no depender de lo que haya validado ya otra pasada (escritorio y
    // móvil comparten base).
    await page.getByRole("tab", { name: /Validación/ }).click();
    await expect(
      page.getByText("Seguimiento del equipo Alevín A: solo sus jugadores."),
    ).toBeVisible();
    await page.getByLabel("Estado").selectOption("");
    await expect(page.getByText("Clara Martí").first()).toBeVisible();
    await expect(page.getByText("Comer sano").first()).toBeVisible();
    await expect(page.getByText("Marc Martí")).toHaveCount(0);

    // Participación: solo para el personal, con los puntos aprobados, acotada al equipo.
    await page.getByRole("tab", { name: /Participación/ }).click();
    await expect(page.getByText("Clara Martí").first()).toBeVisible();
    await expect(page.getByText("Mínimo cumplido").first()).toBeHidden();
    await shot(page, "73-reto-participacion", info.project.name);
    await expectLegibleButtons(page);

    // Sin equipo por medio (desde la vista de conjunto), la validación es de toda la sección.
    await page.goto(`${CLUB}/challenges`);
    await page.getByRole("link", { name: "Reto de hábitos 2026-27" }).first().click();
    await page.getByRole("tab", { name: /Validación/ }).click();
    await page.getByLabel("Estado").selectOption("");
    await expect(page.getByText("Marc Martí").first()).toBeVisible();
    await expect(page.getByText("Lectura").first()).toBeVisible();
    await signOut(page);
  });

  test("la familia registra actividad y ve solo sus puntos", async ({ page }, info) => {
    const sfx = suffix(info.project.name);
    await login(page, "familia@demo.test");
    // El reto no está en la barra: se llega desde la ficha de cada uno de los suyos (ADR 0032).
    await expect(page.getByRole("link", { name: "Reto", exact: true })).toHaveCount(0);
    await page.goto(`${CLUB}/family`);
    await page.getByRole("link", { name: "Clara Martí" }).first().click();
    await page.waitForURL(/\/family\/[0-9a-f-]+$/);
    // Su ficha enseña una tarjeta por reto: el de su sección y el de su equipo.
    await expect(page.getByText("Reto técnico del Alevín A")).toBeVisible();
    await page.getByRole("link", { name: "Ver el reto" }).first().click();
    await page.waitForURL(/\/family\/[0-9a-f-]+\/challenges/);
    await expect(page.getByRole("heading", { name: "Reto", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ficha de Clara Martí" })).toBeVisible();
    // Clara tiene dos retos a la vez: el de su sección (primero) y el de su equipo.
    await expect(page.getByRole("tab", { name: "Fútbol sala" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tab", { name: "Alevín A" })).toBeVisible();
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

    // El reto del Alevín A: solo sus pruebas y su registro pendiente de la entrenadora.
    await page.getByRole("tab", { name: "Alevín A" }).click();
    await expect(page.getByText("Reto técnico del Alevín A").first()).toBeVisible();
    await expect(page.getByText("Mínimo 20")).toBeVisible();
    await expect(page.getByText("Conducción en zigzag").first()).toBeVisible();
    await expect(page.getByText(`Estiramientos ${sfx}`)).toHaveCount(0);

    // Marc solo está en el Benjamín A: desde su ficha, un único reto, el de la sección, sin pestañas.
    await page.goto(`${CLUB}/family`);
    await page.getByRole("link", { name: "Marc Martí" }).first().click();
    await page.waitForURL(/\/family\/[0-9a-f-]+$/);
    await page.getByRole("link", { name: "Ver el reto" }).click();
    await page.waitForURL(/\/family\/[0-9a-f-]+\/challenges/);
    await expect(page.getByText("Lectura").first()).toBeVisible();
    await expect(page.getByRole("tab", { name: "Alevín A" })).toHaveCount(0);
    await signOut(page);
  });

  test("la administración valida, desde el equipo, lo que acaba de registrar la familia", async ({
    page,
  }, info) => {
    const sfx = suffix(info.project.name);
    await login(page);
    await page.goto(`${CLUB}/sections`);
    await page.getByRole("link", { name: /Fútbol sala/ }).click();
    await page.getByRole("link", { name: "Alevín A" }).click();
    await page.getByRole("link", { name: "Reto de hábitos 2026-27" }).click();
    // La cola del equipo: el registro que la familia acaba de hacer en esta misma pasada.
    await page.getByRole("tab", { name: /Validación/ }).click();
    await expect(page.getByText(`Estiramientos ${sfx}`).first()).toBeVisible();
    await expect(page.getByText("Clara Martí").first()).toBeVisible();
    await expect(page.getByText("Marc Martí")).toHaveCount(0);
    await shot(page, "72-reto-validacion", info.project.name);
    await expectLegibleButtons(page);
    await page.getByRole("button", { name: "Aprobar" }).first().click();
    await expect(page.getByText(/Registro de .+ aprobado: \+\d+\./)).toBeVisible();
    await signOut(page);
  });

  test("la entrenadora gestiona solo el reto de su equipo, desde la ficha del equipo", async ({
    page,
  }) => {
    await login(page, "entrenador@demo.test");
    await page.goto(`${CLUB}/sections`);
    await page.getByRole("link", { name: /Fútbol sala/ }).click();
    await page.getByRole("link", { name: "Alevín A" }).click();
    await expect(page.getByRole("heading", { name: "Reto", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nuevo reto" })).toBeVisible();
    // El reto de la sección lo ve, pero no lo edita.
    await page.getByRole("link", { name: "Reto de hábitos 2026-27" }).click();
    await expect(page.getByRole("heading", { name: /Reto de hábitos 2026-27/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nueva prueba" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
    // El de su equipo, sí: catálogo editable y la cola de validación de Clara.
    await page.getByRole("link", { name: "Equipo Alevín A" }).click();
    await page.getByRole("link", { name: "Reto técnico del Alevín A" }).click();
    await expect(page.getByRole("heading", { name: /Reto técnico del Alevín A/ })).toBeVisible();
    await expect(page.getByText("Fútbol sala · Alevín A").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Nueva prueba" })).toBeVisible();
    await page.getByRole("tab", { name: /Validación/ }).click();
    await expect(page.getByText("Clara Martí").first()).toBeVisible();
    await expect(page.getByText("Conducción en zigzag").first()).toBeVisible();
    // Un reto nuevo desde su equipo: el ámbito viene dado y es el de su equipo.
    await page.getByRole("link", { name: "Equipo Alevín A" }).click();
    await page.getByRole("button", { name: "Nuevo reto" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Reto del equipo Alevín A (Fútbol sala).")).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Crear reto" })).toBeEnabled();
    await sheet.getByRole("button", { name: "Cancelar" }).click();
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
    await page.getByRole("link", { name: "Secciones", exact: true }).first().click();
    await expect(page.getByRole("button", { name: "Nueva sección" })).toBeVisible();
    await signOut(page);

    await login(page, "fisio@demo.test");
    await expect(page.getByText("Hola, Núria")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Seguimiento físico" })).toBeVisible();
    await expect(page.getByText(/Cuerpo: \d+ de \d+ valorados/)).toBeVisible();
    await shot(page, "76-fisio-inicio", info.project.name);
    await expectLegibleButtons(page);
    // La fisio valora, pero no da de alta jugadores; y solo ve a quien atiende (Bloque 19).
    await expect(page.getByText(/Ves tu parte del club/)).toBeVisible();
    await page.getByRole("link", { name: "Deportistas" }).first().click();
    await expect(page.getByRole("heading", { name: "Deportistas" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nuevo jugador" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Marc Martí" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Joel Castro" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Socios" })).toHaveCount(0);
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
