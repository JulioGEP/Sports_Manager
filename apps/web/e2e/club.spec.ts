import { expect, test } from "@playwright/test";
import {
  CLUB,
  expectConfirmDialog,
  expectLegibleButtons,
  login,
  shot,
  suffix,
  TEST_LOGO_PNG,
} from "./helpers";

test.describe("espacio del club", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("personal, invitación y roles", async ({ page }, info) => {
    const email = `entrenador-${suffix(info.project.name)}@demo.test`;
    await page.getByRole("link", { name: "Personal" }).first().click();
    await expect(page.getByRole("heading", { name: "Personal" })).toBeVisible();
    await expect(page.getByText("Admin Demo").first()).toBeVisible();
    await shot(page, "10-miembros", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("button", { name: "Invitar" }).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: "Invitar a alguien" })).toBeVisible();
    await sheet.getByLabel("Email", { exact: true }).fill(email);
    await sheet.getByLabel("Rol").selectOption("coach");
    await shot(page, "11-miembros-invitar", info.project.name);
    await expectLegibleButtons(page);
    await sheet.getByRole("button", { name: "Enviar invitación" }).click();

    await expect(page.getByRole("tab", { name: /Invitaciones/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText(`comparte este enlace con ${email}`)).toBeVisible();
    await expect(page.getByText(email).first()).toBeVisible();
    await shot(page, "12-invitaciones", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("tab", { name: /^Personal/ }).click();
    await page.getByRole("button", { name: "Roles" }).first().click();
    await expect(page.getByRole("dialog").getByText("Roles de Admin Demo")).toBeVisible();
    await shot(page, "13-miembros-roles", info.project.name);
    await expectLegibleButtons(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    // Acceso por rol (Bloque 19): un check por rol o cargo y área, con el alcance a la vista.
    await page.getByRole("tab", { name: "Acceso" }).click();
    await expect(page.getByRole("heading", { name: "Qué ve cada rol" })).toBeVisible();
    await expect(page.getByText("Alcance: Sus equipos").first()).toBeVisible();
    const coachMembers = page.getByRole("checkbox", { name: "Socios para Entrenador" });
    await expect(coachMembers).not.toBeChecked();
    await shot(page, "14-personal-acceso", info.project.name);
    await expectLegibleButtons(page);

    // Excepciones por persona (ADR 0036): se añaden, se ven y se quitan aquí mismo, y en ningún
    // otro sitio. Todas las áreas se editan: ver algo que su rol no ve, o no ver algo que sí.
    const overrides = page.getByRole("list", { name: "Excepciones por persona" });
    await expect(page.getByText("Nadie tiene excepciones.")).toBeVisible();
    await page.getByRole("button", { name: "Añadir excepción" }).click();
    const overrideSheet = page.getByRole("dialog");
    await expect(overrideSheet.getByRole("heading", { name: "Nueva excepción" })).toBeVisible();
    await overrideSheet
      .getByLabel("Persona", { exact: true })
      .selectOption({ label: "Carla Vidal · Entrenador" });
    // Se parte de lo que trae su rol: el alcance, lo que ve marcado y lo que no, sin marcar.
    await expect(overrideSheet.getByText("Lo que trae su rol: Entrenador")).toBeVisible();
    await expect(overrideSheet.getByText(/^Alcance: Sus equipos\./)).toBeVisible();
    const members = overrideSheet.getByRole("checkbox", { name: "Socios", exact: true });
    const facilities = overrideSheet.getByRole("checkbox", { name: "Instalaciones", exact: true });
    await expect(members).not.toBeChecked();
    await expect(members).toBeEnabled();
    await expect(facilities).toBeChecked();
    // Socios, Personal, Salud, Cuotas, Tienda y Movimientos: Salud es solo de fisioterapia
    // (ADR 0039) y la Tienda, de quien la gestiona (ADR 0041).
    await expect(overrideSheet.getByText("Su rol no lo ve")).toHaveCount(6);
    await expect(overrideSheet.getByText("Excepción", { exact: true })).toHaveCount(0);
    await members.check();
    await facilities.uncheck();
    await expect(overrideSheet.getByText("Excepción", { exact: true })).toHaveCount(2);
    await shot(page, "14b-personal-excepcion", info.project.name);
    await overrideSheet.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Excepciones de Carla Vidal guardadas.")).toBeVisible();
    await expect(overrides.getByText("Carla Vidal · Entrenador")).toBeVisible();
    await expect(overrides.getByText("Ve Socios")).toBeVisible();
    await expect(overrides.getByText("Sin Instalaciones")).toBeVisible();
    // Al editarla, la hoja recuerda sus excepciones.
    await overrides.getByRole("button", { name: "Editar" }).click();
    await expect(
      page.getByRole("dialog").getByRole("checkbox", { name: "Socios", exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole("dialog").getByRole("checkbox", { name: "Instalaciones", exact: true }),
    ).not.toBeChecked();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await overrides.getByRole("button", { name: "Quitar" }).click();
    await expectConfirmDialog(page);
    await page.getByRole("dialog").getByRole("button", { name: "Quitar" }).click();
    await expect(page.getByText("Nadie tiene excepciones.")).toBeVisible();

    // La hoja de roles no las lleva.
    await page.getByRole("tab", { name: /^Personal/ }).click();
    await page.getByRole("button", { name: "Roles" }).first().click();
    await expect(page.getByRole("dialog").getByText(/Excepciones|Exclusiones/)).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("ajustes: general e identidad del club (escudo, colores, estilo, lema y voz)", async ({
    page,
  }, info) => {
    // En móvil la barra inferior lleva cuatro destinos y "Más": los ajustes viven en esa hoja.
    // La navegación se pinta cuando llega la sesión: se espera a un destino presente en ambas barras.
    await expect(page.getByRole("link", { name: "Secciones", exact: true }).first()).toBeVisible();
    // Exacto: el aviso de puesta en marcha del inicio también enlaza a los ajustes.
    const settingsLink = page.getByRole("link", { name: "Ajustes", exact: true }).first();
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
    } else {
      await page.getByRole("button", { name: "Más" }).click();
      await page.getByRole("dialog").getByRole("link", { name: "Ajustes", exact: true }).click();
    }
    await expect(page.getByRole("heading", { name: "Ajustes del club" })).toBeVisible();
    await expect(page.getByLabel("Nombre del club")).toHaveValue("Club de demostración");
    // La voz ya no vive en General: está con el resto de la identidad.
    await expect(page.getByLabel("Voz del club")).toHaveCount(0);
    await shot(page, "20-ajustes-general", info.project.name);
    await expectLegibleButtons(page);

    const root = (attribute: string) =>
      page.evaluate((a) => document.documentElement.getAttribute(a), attribute);
    const clubFill = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--club-fill")
          .trim()
          .toLowerCase(),
      );
    const pick = (group: string, option: string) =>
      page
        .getByRole("radiogroup", { name: group })
        .getByRole("radio", { name: option, exact: true })
        .check();

    await page.getByRole("tab", { name: "Identidad" }).click();
    await expect(page.getByRole("heading", { name: "Colores" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tipografía" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Voz del club" })).toBeVisible();
    await shot(page, "21-ajustes-identidad", info.project.name);
    await expectLegibleButtons(page);

    // Vista previa en directo: lo que se elige pinta toda la app antes de guardar.
    await page.getByLabel("Color principal").fill("#0f766e");
    await expect.poll(clubFill).toBe("#0f766e");
    await pick("Tipografía", "Deportiva");
    await pick("Navegación", "Del club");
    await pick("Portada", "Rayas");
    await pick("Voz del club", "Vestuario");
    await page.getByLabel("Lema del club").fill("Juntos desde 1952");
    await expect.poll(() => root("data-type")).toBe("deportiva");
    await expect.poll(() => root("data-nav")).toBe("club");
    await expect(page.getByRole("region", { name: "Cambios sin guardar" })).toBeVisible();
    await shot(page, "22-ajustes-identidad-vista-previa", info.project.name);
    await page.getByRole("button", { name: "Guardar identidad" }).click();
    await expect(page.getByText("Identidad guardada. Ya la ve todo el club.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Cambios sin guardar" })).toBeHidden();

    // Guardada, el inicio habla con la voz del club y lleva su lema.
    await page.goto(`${CLUB}`);
    await expect(page.getByText("Juntos desde 1952")).toBeVisible();
    await expect(page.getByText(/¡Vamos, |Siguiente cita:/).first()).toBeVisible();
    expect(await root("data-hero")).toBe("rayas");
    await shot(page, "23-inicio-identidad-propia", info.project.name);
    await page.goto(`${CLUB}/settings?tab=identity`);

    await expect(page.getByRole("heading", { name: "Escudo" })).toBeVisible();
    await page.locator("input[type=file]").setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: TEST_LOGO_PNG,
    });
    await expect(page.getByText("Logo guardado.")).toBeVisible();
    await expect(page.getByRole("img", { name: "Logo del club" })).toBeVisible();
    await shot(page, "24-ajustes-logo-subido", info.project.name);
    await page.getByRole("button", { name: "Quitar logo" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Quitar logo" }).click();
    await expect(page.getByText("Logo quitado.")).toBeVisible();
    await expect(page.getByText("Todavía no hay logo.")).toBeVisible();

    // Deja el club demo con su identidad de origen para el resto de pruebas y capturas.
    await page.getByRole("button", { name: "Rojo y oro" }).click();
    await pick("Tipografía", "Moderna");
    await pick("Navegación", "Clara");
    await pick("Portada", "Lisa");
    await pick("Voz del club", "Cercana");
    await page.getByLabel("Lema del club").fill("");
    await page.getByRole("button", { name: "Guardar identidad" }).click();
    await expect(page.getByText("Identidad guardada. Ya la ve todo el club.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${CLUB}/settings`));
    await expect.poll(clubFill).toBe("#d71920");
    expect(await root("data-type")).toBe("moderna");
    expect(await root("data-nav")).toBe("claro");
  });
});
