import { expect, test } from "@playwright/test";
import { CLUB, DEMO, expectLegibleButtons, login, shot, signOut } from "./helpers";

test.describe("acceso", () => {
  test("login con error, login correcto, menú y cierre de sesión", async ({ page }, info) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await shot(page, "01-login", info.project.name);
    await expectLegibleButtons(page);

    await page.getByLabel("Email").fill(DEMO.email);
    await page.getByLabel("Contraseña").fill("incorrecta");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert")).toContainText("Email o contraseña incorrectos");
    await shot(page, "02-login-error", info.project.name);

    await login(page);
    await expect(page).toHaveURL(new RegExp(`${CLUB}$`));
    await expect(page.getByRole("heading", { name: "Club de demostración" })).toBeVisible();
    await shot(page, "03-inicio", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("button", { name: "Menú de usuario" }).click();
    await expect(page.getByText(DEMO.email)).toBeVisible();
    await shot(page, "04-menu-persona", info.project.name);
    await page.keyboard.press("Escape");

    await signOut(page);
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  });

  test("sin sesión, las páginas del club llevan al login y vuelven después", async ({ page }) => {
    await page.goto(`${CLUB}/members`);
    await page.waitForURL(/\/login\?next=%2Fdemo%2Fmembers/);
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await page.getByLabel("Email").fill(DEMO.email);
    await page.getByLabel("Contraseña").fill(DEMO.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(new RegExp(`${CLUB}/members$`));
    await expect(page.getByRole("heading", { name: "Miembros" })).toBeVisible();
  });

  test("un club que no existe no abre nada", async ({ page }) => {
    await login(page);
    await page.goto("/no-existe");
    await expect(page.getByText("Este club no existe o no está activo.")).toBeVisible();
  });

  test("recuperar contraseña", async ({ page }, info) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "¿Has olvidado la contraseña?" }).click();
    await expect(page.getByRole("heading", { name: "Recuperar contraseña" })).toBeVisible();
    await shot(page, "05-recuperar", info.project.name);
    await expectLegibleButtons(page);
    await page.getByLabel("Email").fill(DEMO.email);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(page.getByText("Si existe una cuenta con ese email")).toBeVisible();
    await shot(page, "06-recuperar-enviado", info.project.name);
  });

  test("nueva contraseña sin token avisa", async ({ page }, info) => {
    await page.goto("/reset-password");
    await expect(page.getByText("Este enlace no es válido")).toBeVisible();
    await shot(page, "07-nueva-contrasena-sin-token", info.project.name);
  });
});
