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
    await page.waitForURL(new RegExp(`/${slug}$`));
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
