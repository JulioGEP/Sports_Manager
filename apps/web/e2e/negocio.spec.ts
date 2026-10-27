import { expect, test } from "@playwright/test";
import { expectLegibleButtons, login, readInvitationLink, shot, suffix } from "./helpers";

test.describe("entrada del negocio", () => {
  test("sin sesión, /admin lleva a su propia entrada; el primer administrador se da de alta solo", async ({
    page,
  }, info) => {
    const email = `plataforma-${suffix(info.project.name)}@demo.test`;

    await page.goto("/admin");
    await page.waitForURL(/\/admin\/login/);
    await expect(page.getByRole("heading", { name: "Administración del negocio" })).toBeVisible();
    await shot(page, "48-negocio-login", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("link", { name: /Crea tu cuenta de administrador/ }).click();
    await expect(
      page.getByRole("heading", { name: "Crear cuenta de administrador" }),
    ).toBeVisible();
    await page.getByLabel("Tu nombre").fill("Julio Prueba");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill("123456");
    await page.getByLabel("Repite la contraseña").fill("123456");
    await shot(page, "49-negocio-alta-administrador", info.project.name);
    await expectLegibleButtons(page);
    await page.getByRole("button", { name: "Crear cuenta y entrar" }).click();

    await page.waitForURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Clubes" })).toBeVisible();
    await expect(page.locator("aside")).toContainText("Julio Prueba");

    // Un email no autorizado no puede darse de alta.
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.waitForURL(/\/admin\/login/);
    await page.goto("/admin/setup");
    await page.getByLabel("Tu nombre").fill("Intruso");
    await page.getByLabel("Email").fill(`intruso-${suffix(info.project.name)}@demo.test`);
    await page.getByLabel("Contraseña", { exact: true }).fill("123456");
    await page.getByLabel("Repite la contraseña").fill("123456");
    await page.getByRole("button", { name: "Crear cuenta y entrar" }).click();
    await expect(page.getByRole("alert")).toContainText("no está autorizado");

    // Y la cuenta recién creada entra por /admin/login.
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill("123456");
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Clubes" })).toBeVisible();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.waitForURL(/\/admin\/login/);
  });
});

test.describe("panel del negocio", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("clubes, alta de club, invitación de su administrador y cambio de club", async ({
    page,
  }, info) => {
    const slug = `prueba-${suffix(info.project.name)}`;
    const name = `Club Prueba ${suffix(info.project.name)}`;
    const email = "admin@demo.test";

    await page.getByRole("button", { name: "Menú de usuario" }).click();
    await page.getByRole("menuitem", { name: "Administración del negocio" }).click();
    await expect(page.getByRole("heading", { name: "Clubes" })).toBeVisible();
    await expect(page.getByText("Club de demostración").first()).toBeVisible();
    await shot(page, "50-negocio-clubes", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("button", { name: "Nuevo club" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Nombre del club").fill(name);
    await expect(sheet.getByLabel("Subdominio")).toHaveValue(`club-${slug}`);
    await sheet.getByLabel("Subdominio").fill(slug);
    await expect(sheet.getByText("La marca y el logo los configura el club")).toBeVisible();
    await shot(page, "51-negocio-nuevo-club", info.project.name);
    await expectLegibleButtons(page);
    await sheet.getByRole("button", { name: "Crear club" }).click();

    await page.waitForURL(`/admin/clubs/${slug}`);
    await expect(page.getByRole("heading", { name: /Club Prueba/ })).toBeVisible();
    await expect(page.getByText("Este club todavía no tiene administrador.")).toBeVisible();
    await shot(page, "52-negocio-ficha-club", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("button", { name: "Invitar administrador" }).click();
    await page.getByRole("dialog").getByLabel("Email", { exact: true }).fill(email);
    await shot(page, "53-negocio-invitar-admin", info.project.name);
    await page.getByRole("dialog").getByRole("button", { name: "Enviar invitación" }).click();
    await expect(page.getByText(`comparte este enlace con ${email}`)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tus invitaciones a este club" })).toBeVisible();
    await shot(page, "54-negocio-ficha-club-invitado", info.project.name);
    await expectLegibleButtons(page);
    const link = await readInvitationLink(page);
    expect(link).toContain(`://localhost:3000/${slug}/invitations/`);

    await page.getByRole("button", { name: "Suspender" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Suspender" }).click();
    await expect(page.getByText("Estado cambiado a suspendido.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reactivar" })).toBeVisible();
    await page.getByRole("button", { name: "Reactivar" }).click();
    await expect(page.getByText("Estado cambiado a activo.")).toBeVisible();

    // La misma persona acepta la invitación en la ruta del club nuevo: misma sesión, otro club.
    await page.goto(new URL(link).pathname);
    await expect(page.getByRole("heading", { name: /Invitación a Club Prueba/ })).toBeVisible();
    await shot(page, "60-club-nuevo-invitacion", info.project.name);
    await page.getByRole("button", { name: /Unirme a Club Prueba/ }).click();

    // Un club por estrenar (ADR 0059): su administración entra primero a la puesta en marcha, con
    // el recorrido en sombra por cada paso.
    await page.waitForURL(new RegExp(`/${slug}/settings$`));
    // Sin movimiento, cada paso queda quieto al instante y las capturas salen enteras.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const tour = page.getByRole("dialog");
    const spotlight = page.locator(".tour-spotlight");
    await expect(tour.getByRole("heading", { name: "Tu club, listo en 5 pasos" })).toBeVisible();
    await expect(tour.getByText("Paso 1 de 10")).toBeVisible();
    await expect(spotlight).toBeVisible();
    // Lo iluminado se ve tal cual: el fondo de los diálogos no lo apaga.
    expect(await tour.evaluate((d) => getComputedStyle(d, "::backdrop").backgroundColor)).toBe(
      "rgba(0, 0, 0, 0)",
    );
    await shot(page, "60b-club-nuevo-recorrido", info.project.name, { fullPage: false });
    const steps = [
      "Tu escudo, en todas partes",
      "Colores, letra y voz",
      "La temporada actual",
      "Secciones y equipos",
      "Tu cuerpo técnico",
      "Todo lo demás, por pestañas",
      "El club, por áreas",
      "Busca o haz cualquier cosa",
    ];
    for (const title of steps) {
      await tour.getByRole("button", { name: "Seguir" }).click();
      await expect(tour.getByRole("heading", { name: title })).toBeVisible();
      await expect(spotlight).toBeVisible();
      if (title === "Tu escudo, en todas partes") {
        await shot(page, "60c-club-nuevo-recorrido-logo", info.project.name, { fullPage: false });
      }
      if (title === "El club, por áreas") {
        await shot(page, "60d-club-nuevo-recorrido-areas", info.project.name, { fullPage: false });
      }
    }
    await tour.getByRole("button", { name: "Seguir" }).click();
    await expect(tour.getByRole("heading", { name: "Empieza por aquí" })).toBeVisible();
    await expect(tour.getByText("Paso 10 de 10")).toBeVisible();
    await shot(page, "60e-club-nuevo-recorrido-fin", info.project.name, { fullPage: false });
    // El último paso lleva al primero pendiente: subir el logo.
    await tour.getByRole("button", { name: "Subir logo" }).click();
    await expect(tour).toBeHidden();
    await page.waitForURL(new RegExp(`/${slug}/settings\\?tab=identity$`));

    // Visto: el recorrido se vuelve a ver desde la puesta en marcha y se salta cuando se quiere.
    await page.goto(`/${slug}/settings`);
    await expect(page.getByRole("heading", { name: "Puesta en marcha" })).toBeVisible();
    await expect(tour).toBeHidden();
    await page.getByRole("button", { name: "Ver recorrido" }).click();
    await expect(tour.getByRole("heading", { name: "Tu club, listo en 5 pasos" })).toBeVisible();
    await tour.getByRole("button", { name: "Saltar" }).click();
    await expect(tour).toBeHidden();

    // Y el inicio ya es la portada del club nuevo.
    await page.goto(`/${slug}`);
    await expect(page.getByRole("heading", { name: /Club Prueba/ })).toBeVisible();
    await shot(page, "61-club-nuevo-inicio", info.project.name);
    await expectLegibleButtons(page);

    // Con dos clubes, el selector muestra ambos.
    await page.getByRole("button", { name: "Menú de usuario" }).click();
    await page.getByRole("menuitem", { name: "Mis clubes" }).click();
    await expect(page.getByRole("heading", { name: "Mis clubes" })).toBeVisible();
    await expect(page.getByText("Club de demostración")).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
    await shot(page, "62-mis-clubes", info.project.name);
    await expectLegibleButtons(page);
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.waitForURL((url) => url.pathname.startsWith("/login"));
  });

  test("ficha del club demo con sus administradores", async ({ page }, info) => {
    await page.goto("/admin/clubs/demo");
    await expect(page.getByRole("heading", { name: /Club de demostración/ })).toBeVisible();
    await expect(page.getByText("Admin Demo").filter({ visible: true }).first()).toBeVisible();
    await shot(page, "55-negocio-ficha-demo", info.project.name);
    await expectLegibleButtons(page);
  });

  test("actividad y sistema", async ({ page }, info) => {
    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: "Actividad" })).toBeVisible();
    await expect(page.getByText("Club creado").first()).toBeVisible();
    await shot(page, "56-negocio-actividad", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("link", { name: "Sistema" }).click();
    await expect(page.getByRole("heading", { name: "Sistema" })).toBeVisible();
    await expect(page.getByText("API operativa")).toBeVisible();
    await shot(page, "57-negocio-sistema", info.project.name);
  });
});
