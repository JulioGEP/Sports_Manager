import { expect, test } from "@playwright/test";
import { CLUB, expectLegibleButtons, login, shot, signOut } from "./helpers";

/**
 * Rol de deportista (ADR 0045) sobre la semilla del club demo: Miguel Lozano (Sénior A) y Carme
 * Segura (Yoga suave lunes) entran con su cuenta a lo suyo (inicio, ficha, entrenamientos y
 * bienestar) sin ver nada del club; la administración da acceso a un deportista desde su ficha y
 * mira el club con sus ojos.
 */
const PASSWORD = "123456";

test.describe("deportista", () => {
  test("el deportista entra a lo suyo: su día, su ficha y sus entrenamientos", async ({
    page,
  }, info) => {
    await login(page, "jugador@demo.test", PASSWORD);
    await expect(page.getByText("Lo tuyo de hoy")).toBeVisible();
    await expect(page.getByText("Tu próxima sesión")).toBeVisible();
    // Nada del club: ni deportistas, ni personal, ni "Mi familia".
    await expect(page.getByRole("link", { name: "Deportistas" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Mi familia" })).toHaveCount(0);
    if (info.project.name === "escritorio") {
      for (const name of ["Mi ficha", "Mi plan", "Mi bienestar", "Agenda"])
        await expect(page.getByRole("link", { name, exact: true }).first()).toBeVisible();
    }
    await shot(page, "130-deportista-inicio", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("link", { name: "Ver mi ficha" }).click();
    await expect(page.getByRole("heading", { name: "Miguel Lozano", level: 1 })).toBeVisible();
    await expect(page.getByText("Tu ficha en el club", { exact: false })).toBeVisible();
    await expect(page.getByText("Sénior A").first()).toBeVisible();
    await shot(page, "131-deportista-ficha", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("link", { name: "Mi plan", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Mi plan", level: 1 })).toBeVisible();
    await shot(page, "132-deportista-entrenamientos", info.project.name);
    await expectLegibleButtons(page);
    await signOut(page);
  });

  test("la deportista de una actividad ve sus clases", async ({ page }, info) => {
    await login(page, "deportista@demo.test", PASSWORD);
    await expect(page.getByText("Lo tuyo de hoy")).toBeVisible();
    await page.goto(`${CLUB}/me/training`);
    await expect(page.getByRole("heading", { name: "Mi plan", level: 1 })).toBeVisible();
    await expect(page.getByText("Carme Segura")).toBeVisible();
    // Una clase de yoga no se planifica: no se anuncia como un plan pendiente.
    await expect(page.getByText("Sin plan publicado")).toHaveCount(0);
    await shot(page, "133-deportista-actividad", info.project.name);
    await signOut(page);
  });

  test("la administración da acceso a un deportista desde su ficha", async ({ page }, info) => {
    // Escritorio y móvil comparten base: cada proyecto invita a un deportista distinto.
    const [name, email] =
      info.project.name === "escritorio"
        ? ["Pau Ferran", "pau.ferran@demo.test"]
        : ["Arnau Llopis", "arnau.llopis@demo.test"];
    await login(page);
    await page.goto(`${CLUB}/players`);
    await page.getByRole("searchbox").first().fill(name);
    await page.getByRole("link", { name }).first().click();
    await expect(page.getByRole("heading", { name: "Acceso del deportista" })).toBeVisible();
    await page.getByRole("button", { name: "Dar acceso" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Email del deportista").fill(email);
    await sheet.getByRole("button", { name: "Enviar invitación" }).click();
    await expect(page.getByText(/Invitación enviada · caduca el/)).toBeVisible();
    await shot(page, "134-ficha-acceso-deportista", info.project.name);
    await expectLegibleButtons(page);
  });

  test("ver el club como un deportista", async ({ page }, info) => {
    await login(page);
    await page.getByRole("button", { name: /menú de usuario|user menu/i }).click();
    await page.getByRole("menuitem", { name: "Ver el club como…" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Buscar por nombre o email").fill("Miguel");
    const miguel = sheet.getByRole("button", { name: /Miguel Lozano/ });
    await expect(miguel.getByText("Deportista")).toBeVisible();
    await miguel.click();
    await expect(
      page.getByText(/Estás viendo el club como Miguel Lozano \(Deportista\)/),
    ).toBeVisible();
    await expect(page.getByText("Lo tuyo de hoy")).toBeVisible();
    await shot(page, "135-ver-como-deportista", info.project.name);
    await page.getByRole("button", { name: "Volver a mi vista" }).click();
    await expect(page.getByText(/Estás viendo el club como/)).toHaveCount(0);
  });
});
