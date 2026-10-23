import { expect, test } from "@playwright/test";
import { CLUB, expectLegibleButtons, login, shot, signOut, TEST_LOGO_PNG } from "./helpers";

/**
 * Tienda del club (ADR 0041) con el club demo: la familia compra para sus menores desde la tienda
 * fijada en su página; la administración prepara, cobra y entrega, da de alta productos con tallas
 * y foto y vende en el mostrador; el catálogo público se activa para la web del club; y el
 * deportista adulto compra lo suyo. Escritorio y móvil comparten base: cada vuelta crea lo suyo.
 */
test.describe("tienda del club", () => {
  test("la familia compra para sus menores y ve el pedido en sus cuotas", async ({
    page,
  }, info) => {
    await login(page, "familia@demo.test");
    await page.goto(`${CLUB}/family`);
    const spotlight = page.getByRole("heading", { name: "Tienda del club" });
    await expect(spotlight).toBeVisible();
    await shot(page, "110-familia-tienda-fijada", info.project.name);

    await page.getByRole("link", { name: "Ir a la tienda" }).click();
    await page.waitForURL(/\/store$/);
    await expect(page.getByRole("heading", { level: 1, name: "Tienda del club" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ropa" })).toBeVisible();
    // La cena es solo del Alevín A: Clara está en él.
    await expect(page.getByText("Cena de fin de temporada del Alevín A")).toBeVisible();
    // Lo de borrador no se ve.
    await expect(page.getByText("Mochila del club")).toHaveCount(0);
    await shot(page, "111-tienda-catalogo", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("button", { name: /Sudadera del club/ }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("button", { name: "S", exact: true })).toBeDisabled();
    await sheet.getByRole("button", { name: "L", exact: true }).click();
    await sheet.getByLabel("Para quién").selectOption({ label: "Clara Martí" });
    await shot(page, "112-tienda-producto", info.project.name);
    await sheet.getByRole("button", { name: /Añadir a la cesta/ }).click();
    await expect(page.getByRole("button", { name: "Cesta (1)" })).toBeVisible();

    await page.getByRole("button", { name: "Cesta (1)" }).click();
    const cart = page.getByRole("dialog");
    await expect(cart.getByRole("heading", { name: "Para Clara Martí" })).toBeVisible();
    await cart.getByLabel("Nota para el club").fill("Con su nombre, por favor");
    await shot(page, "113-tienda-cesta", info.project.name);
    await cart.getByRole("button", { name: /Hacer pedido/ }).click();
    const confirm = page.getByRole("dialog", { name: "¿Hacer el pedido?" });
    await confirm.getByRole("button", { name: "Hacer pedido", exact: true }).click();
    await expect(page.getByText(/Pedido T-\d{4} hecho\./)).toBeVisible();

    await expect(page.getByRole("tab", { name: /Mis pedidos/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("Con su nombre, por favor", { exact: false })).toBeVisible();
    await expect(page.getByText("Recibido").first()).toBeVisible();
    await shot(page, "114-tienda-mis-pedidos", info.project.name);
    await expectLegibleButtons(page);

    // El pedido se cobra como una cuota.
    await page.goto(`${CLUB}/fees`);
    await expect(page.getByText(/Pedido T-\d{4} · Tienda/).first()).toBeVisible();
    await signOut(page);
  });

  test("la administración prepara, cobra y entrega, y da de alta productos", async ({
    page,
  }, info) => {
    const sfx = info.project.name;
    await login(page);
    await page.goto(`${CLUB}/store`);
    await expect(page.getByRole("heading", { level: 1, name: "Tienda" })).toBeVisible();
    await expect(page.getByText("Por preparar", { exact: true })).toBeVisible();
    await shot(page, "115-tienda-pedidos", info.project.name);
    await expectLegibleButtons(page);

    // El último pedido de la familia: se cobra en efectivo y se entrega.
    await page
      .getByRole("link", { name: /T-\d{4}/ })
      .first()
      .click();
    await page.waitForURL(/\/store\/orders\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { level: 1, name: /Pedido T-\d{4}/ })).toBeVisible();
    await page.getByRole("button", { name: "Cobrar" }).click();
    const pay = page.getByRole("dialog");
    await pay.getByRole("button", { name: "Registrar" }).click();
    await expect(page.getByText("Pago registrado.")).toBeVisible();
    await expect(page.getByText("Pagado", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Marcar como listo" }).click();
    await expect(page.getByRole("button", { name: "Marcar como entregado" })).toBeVisible();
    await shot(page, "116-tienda-pedido", info.project.name);
    await page.getByRole("button", { name: "Marcar como entregado" }).click();
    await expect(page.getByRole("button", { name: "Volver a listo" })).toBeVisible();

    // Productos: alta con tallas infantiles, stock y foto.
    await page.goto(`${CLUB}/store?tab=products`);
    await expect(page.getByText("Camiseta oficial de juego")).toBeVisible();
    await expect(page.getByText(/Agotado: S/)).toBeVisible();
    await shot(page, "117-tienda-productos", info.project.name);
    await page.getByRole("button", { name: "Nuevo producto" }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Nombre").fill(`Gorra ${sfx}`);
    await sheet.getByLabel("Precio (€)").fill("12,50");
    await sheet.getByLabel("Tiene tallas u opciones").check();
    await sheet.getByRole("button", { name: "Tallas infantiles" }).click();
    await sheet.getByLabel("Stock de 8").fill("4");
    await sheet.getByLabel("Estado").selectOption("active");
    await sheet.getByLabel("Dónde se enseña").selectOption("public");
    await shot(page, "118-tienda-producto-nuevo", info.project.name);
    await sheet.getByRole("button", { name: "Crear producto" }).click();
    await expect(page.getByText("Producto creado.")).toBeVisible();
    await sheet.getByLabel("Foto del producto").setInputFiles({
      name: "gorra.png",
      mimeType: "image/png",
      buffer: TEST_LOGO_PNG,
    });
    await expect(page.getByText("Foto guardada.")).toBeVisible();
    await sheet.getByRole("button", { name: "Cerrar" }).last().click();
    await expect(page.getByText(`Gorra ${sfx}`)).toBeVisible();

    // Venta en el mostrador.
    await page.goto(`${CLUB}/store?counter=1`);
    const counter = page.getByRole("dialog");
    await counter.getByLabel("Para quién").fill("Àlex");
    await counter.getByRole("button", { name: /Àlex Moreno/ }).click();
    await counter.getByLabel("Producto").selectOption({ label: "Botella del club · 8,00 €" });
    await counter.getByRole("button", { name: "Añadir", exact: true }).click();
    await shot(page, "119-tienda-mostrador", info.project.name);
    await counter.getByRole("button", { name: /Crear pedido/ }).click();
    await page.waitForURL(/\/store\/orders\/[0-9a-f-]+$/);
    await expect(page.getByText("En el mostrador")).toBeVisible();
  });

  test("el catálogo público se activa para la web del club", async ({ page }, info) => {
    await login(page);
    await page.goto(`${CLUB}/settings?tab=developers`);
    await expect(page.getByRole("heading", { name: "Catálogo público" })).toBeVisible();
    const enable = page.getByRole("button", { name: "Activar el catálogo público" });
    if (await enable.isVisible()) await enable.click();
    await expect(page.getByText(/^pk_[a-f0-9]{32}$/)).toBeVisible();
    await page.getByRole("button", { name: "Probar ahora" }).click();
    await expect(page.getByText(/Funciona: \d+ productos/)).toBeVisible();
    await shot(page, "120-ajustes-desarrolladores", info.project.name);
    await expectLegibleButtons(page);
  });

  test("el deportista adulto compra lo suyo y no ve lo de otros equipos", async ({
    page,
  }, info) => {
    await login(page, "jugador@demo.test");
    await page.goto(`${CLUB}/store`);
    await expect(page.getByRole("heading", { level: 1, name: "Tienda del club" })).toBeVisible();
    await expect(page.getByText("Camiseta oficial de juego")).toBeVisible();
    await expect(page.getByText("Cena de fin de temporada del Alevín A")).toHaveCount(0);
    await page.getByRole("tab", { name: /Mis pedidos/ }).click();
    await expect(page.getByText("T-0002")).toBeVisible();
    await shot(page, "121-tienda-deportista", info.project.name);
    await signOut(page);
  });
});
