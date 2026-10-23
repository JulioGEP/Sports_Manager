import { expect, test } from "@playwright/test";
import { CLUB, expectLegibleButtons, login, shot } from "./helpers";

/**
 * Pasarela de pago y contabilidad (ADR 0042): Cuotas explica que para cobrar en línea hay que
 * conectar una pasarela como Stripe, y que la contabilidad puede ir sola a Holded. Ajustes da de
 * alta la cuenta de Stripe del club y conecta Holded con su clave. En local no hay claves de Stripe
 * ni Holded de verdad: se recorre lo que ve el club antes de conectar.
 */
test.describe("pasarela de pago y contabilidad", () => {
  test("cuotas explica qué falta para cobrar en línea y llevar la contabilidad", async ({
    page,
  }, info) => {
    await login(page);
    await page.goto(`${CLUB}/fees`);
    await expect(page.getByRole("heading", { level: 1, name: "Cuotas" })).toBeVisible();
    await expect(page.getByText("El club cobra a mano")).toBeVisible();
    await page.getByRole("button", { name: "Ver cómo conectarla" }).click();
    await expect(page.getByRole("tab", { name: "Pasarela y contabilidad" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("heading", { name: "Pasarela de pago" })).toBeVisible();
    await expect(page.getByText("Usamos Stripe.", { exact: false })).toBeVisible();
    await expect(
      page.getByText("Falta que la plataforma configure sus claves de Stripe."),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contabilidad" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Conectar Holded" })).toBeVisible();
    await shot(page, "123-cuotas-pasarela-y-contabilidad", info.project.name);
    await expectLegibleButtons(page);
  });

  test("ajustes: la cuenta de Stripe del club y conectar Holded", async ({ page }, info) => {
    await login(page);
    await page.goto(`${CLUB}/settings?tab=payments`);
    await expect(page.getByRole("heading", { name: "Cómo cobra el club" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cuenta de Stripe del club" })).toBeVisible();
    await expect(page.getByText("Sin cuenta").first()).toBeVisible();
    await shot(page, "124-ajustes-cuenta-de-stripe", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("tab", { name: "Contabilidad" }).click();
    await expect(page.getByRole("heading", { name: "Conectar Holded" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cómo conseguir la clave" })).toBeVisible();
    // Sin clave no se conecta; con una corta, tampoco.
    const connect = page.getByRole("button", { name: "Conectar" });
    await expect(connect).toBeDisabled();
    await page.getByLabel("Clave de API de Holded").fill("corta");
    await expect(connect).toBeDisabled();
    await shot(page, "125-ajustes-conectar-holded", info.project.name);
    await expectLegibleButtons(page);
  });

  test("la familia no ve la pasarela ni la contabilidad del club", async ({ page }) => {
    await login(page, "familia@demo.test");
    await page.goto(`${CLUB}/fees`);
    await expect(page.getByRole("heading", { name: "Mis cuotas" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Pasarela y contabilidad" })).toHaveCount(0);
    await expect(page.getByText("El club cobra a mano")).toHaveCount(0);
  });
});
