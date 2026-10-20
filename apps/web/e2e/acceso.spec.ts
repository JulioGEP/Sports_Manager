import { expect, test } from "@playwright/test";
import { DEMO, expectLegibleButtons, login, shot, signOut } from "./helpers";

test.describe("acceso", () => {
  test("login con error, login correcto, menú y cierre de sesión", async ({ page }, info) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await shot(page, "01-login", info.project.name);
    await expectLegibleButtons(page);

    await page.getByLabel("Email").fill(DEMO.email);
    await page.getByLabel("Contraseña").fill("incorrecta");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.locator(".alert--error")).toContainText("Email o contraseña incorrectos");
    await shot(page, "02-login-error", info.project.name);

    await login(page);
    await expect(page.getByRole("heading", { name: /Hola, Admin/ })).toBeVisible();
    await shot(page, "03-inicio", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("button", { name: "Menú de usuario" }).click();
    await expect(page.getByText(DEMO.email)).toBeVisible();
    await shot(page, "04-menu-persona", info.project.name);
    await page.keyboard.press("Escape");

    await signOut(page);
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  });

  test("sin sesión, las páginas del club llevan al login", async ({ page }) => {
    await page.goto("/members");
    await page.waitForURL(/\/login\?next=%2Fmembers/);
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
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
