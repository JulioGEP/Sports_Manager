import { expect, test } from "@playwright/test";
import { DEMO, expectLegibleButtons, login, readInvitationLink, shot, suffix } from "./helpers";

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
    await expect(page.locator(".sidebar__user")).toContainText("Julio Prueba");

    // Un email no autorizado no puede darse de alta.
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.waitForURL(/\/admin\/login/);
    await page.goto("/admin/setup");
    await page.getByLabel("Tu nombre").fill("Intruso");
    await page.getByLabel("Email").fill(`intruso-${suffix(info.project.name)}@demo.test`);
    await page.getByLabel("Contraseña", { exact: true }).fill("123456");
    await page.getByLabel("Repite la contraseña").fill("123456");
    await page.getByRole("button", { name: "Crear cuenta y entrar" }).click();
    await expect(page.locator(".alert--error")).toContainText("no está autorizado");

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

  test("clubes, alta de club e invitación de su administrador", async ({ page }, info) => {
    const slug = `prueba-${suffix(info.project.name)}`;
    const email = DEMO.email;

    await page.getByRole("button", { name: "Menú de usuario" }).click();
    await page.getByRole("link", { name: "Administración del negocio" }).click();
    await expect(page.getByRole("heading", { name: "Clubes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Club de demostración" })).toBeVisible();
    await shot(page, "50-negocio-clubes", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("button", { name: "Nuevo club" }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Nombre del club").fill(`Club Prueba ${suffix(info.project.name)}`);
    await expect(drawer.getByLabel("Subdominio")).toHaveValue(`club-${slug}`);
    await drawer.getByLabel("Subdominio").fill(slug);
    await expect(drawer.getByText("La marca y el logo los configura el club")).toBeVisible();
    await shot(page, "51-negocio-nuevo-club", info.project.name);
    await expectLegibleButtons(page);
    await drawer.getByRole("button", { name: "Crear club" }).click();

    await page.waitForURL(`/admin/${slug}`);
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
    expect(link).toContain(`://${slug}.sportsmanager.localhost:3000/`);

    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Suspender" }).click();
    await expect(page.getByText("Estado cambiado a suspendido.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reactivar" })).toBeVisible();
    await page.getByRole("button", { name: "Reactivar" }).click();
    await expect(page.getByText("Estado cambiado a activo.")).toBeVisible();

    // La misma persona acepta la invitación en el subdominio del club nuevo: misma sesión, otro club.
    await page.goto(link);
    await expect(page.getByRole("heading", { name: /Invitación a Club Prueba/ })).toBeVisible();
    await shot(page, "60-club-nuevo-invitacion", info.project.name);
    await page.getByRole("button", { name: /Unirme a Club Prueba/ }).click();
    await expect(page.getByRole("heading", { name: /Hola, Admin/ })).toBeVisible();
    await expect(page.locator(".topbar__name")).toHaveText(/Club Prueba/);
    await shot(page, "61-club-nuevo-inicio", info.project.name);
    await expectLegibleButtons(page);

    // Con dos clubes, el selector muestra ambos y marca en cuál estás.
    await page.getByRole("button", { name: "Menú de usuario" }).click();
    await page.getByRole("link", { name: "Mis clubes" }).click();
    await expect(page.getByRole("heading", { name: "Mis clubes" })).toBeVisible();
    await expect(page.getByText("Club de demostración")).toBeVisible();
    await expect(page.getByText("Estás aquí")).toBeVisible();
    await shot(page, "62-mis-clubes", info.project.name);
    await expectLegibleButtons(page);
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.waitForURL((url) => url.pathname.startsWith("/login"));
  });

  test("ficha del club demo con sus administradores", async ({ page }, info) => {
    await page.goto("/admin/demo");
    await expect(page.getByRole("heading", { name: /Club de demostración/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: /Admin Demo/ })).toBeVisible();
    await shot(page, "55-negocio-ficha-demo", info.project.name);
    await expectLegibleButtons(page);
  });

  test("actividad y sistema", async ({ page }, info) => {
    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: "Actividad" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await shot(page, "56-negocio-actividad", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("link", { name: "Sistema" }).click();
    await expect(page.getByRole("heading", { name: "Sistema" })).toBeVisible();
    await expect(page.getByText("API operativa")).toBeVisible();
    await shot(page, "57-negocio-sistema", info.project.name);
  });
});
