import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { CLUB, expectLegibleButtons, login, shot, signOut, suffix } from "./helpers";

/**
 * Partido en directo (Bloque 20, ADR 0034): configuración del motor por sección, partidos del
 * equipo, estadísticas e histórico de los partidos sembrados, un partido nuevo registrado desde
 * la consola (quinteto, cronómetro, gol con zona, gol rival, cambio, deshacer y cierre) y lo que
 * ven la entrenadora y la familia.
 */
test.describe("partido en directo", () => {
  test("configuración, partidos, estadísticas, histórico y un partido registrado en la banda", async ({
    page,
  }, info) => {
    const sfx = suffix(info.project.name);
    await login(page);

    // Configuración del motor en la sección de fútbol sala: ajustes y catálogo que propone el deporte.
    await page.goto(`${CLUB}/sections`);
    await page.getByRole("link", { name: /Fútbol sala/ }).click();
    await page.getByRole("link", { name: "Partido en directo" }).click();
    await expect(page.getByRole("heading", { name: "Partido en directo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cómo se juega" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Catálogo de acciones" })).toBeVisible();
    await expect(page.getByText("Gol", { exact: true }).first()).toBeVisible();
    await shot(page, "100-partido-configuracion", info.project.name);
    await expectLegibleButtons(page);

    // Una acción nueva inventada por el club: saque de banda, del equipo, en la bandeja rápida.
    await page.getByRole("button", { name: "Nueva acción" }).click();
    const actionSheet = page.getByRole("dialog");
    await actionSheet.getByLabel("Nombre", { exact: true }).fill(`Saque de banda ${sfx}`);
    await actionSheet.getByLabel("A quién se aplica").selectOption("team");
    await actionSheet.getByLabel("Tipo", { exact: true }).selectOption("neutral");
    await shot(page, "100b-partido-accion-nueva", info.project.name);
    await actionSheet.getByRole("button", { name: "Crear acción" }).click();
    await expect(page.getByText(`Acción Saque de banda ${sfx} creada.`)).toBeVisible();
    await expect(page.getByText(`Saque de banda ${sfx}`).first()).toBeVisible();

    // La ficha del equipo lleva la tarjeta de partidos con los dos sembrados.
    await page.goto(`${CLUB}/sections`);
    await page.getByRole("link", { name: /Fútbol sala/ }).click();
    await page.getByRole("link", { name: "Alevín A" }).click();
    await expect(page.getByRole("heading", { name: "Alevín A" })).toBeVisible();
    await expect(page.getByRole("link", { name: "FS Castelldefels" })).toBeVisible();
    await expect(page.getByText("4–3").first()).toBeVisible();
    await page.getByRole("link", { name: "Ver todos" }).click();
    await expect(page.getByRole("heading", { name: "Partidos", exact: true })).toBeVisible();
    await expect(page.getByText("Victoria").first()).toBeVisible();
    await expect(page.getByText("Empate").first()).toBeVisible();
    await shot(page, "101-partidos", info.project.name);
    await expectLegibleButtons(page);

    // Estadísticas del partido sembrado: comparativa, zonas, trabajo por periodos y jugadores.
    await page
      .locator("tr, li")
      .filter({ hasText: "FS Castelldefels" })
      .getByRole("link", { name: "Estadísticas" })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: /4 – 3/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Comparativa con el rival" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mapa de finalización" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Jugadores de pista" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Porteros" })).toBeVisible();
    await expect(page.getByText("Oriol Mateu").first()).toBeVisible();
    await shot(page, "102-partido-estadisticas", info.project.name);
    await expectLegibleButtons(page);
    await page.getByRole("button", { name: "2ª parte" }).click();
    await expect(page.getByRole("button", { name: "2ª parte" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // El Excel se genera en el navegador: lo que baja es un ZIP (cabecera "PK") con las hojas.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Exportar a Excel" }).click(),
    ]);
    const file = await download.path();
    expect(readFileSync(file).subarray(0, 2).toString("latin1")).toBe("PK");

    // Histórico del equipo: los dos partidos elegidos, acumulados y cruce de métricas.
    await page.goto(`${CLUB}/sections`);
    await page.getByRole("link", { name: /Fútbol sala/ }).click();
    await page.getByRole("link", { name: "Alevín A" }).click();
    await page.getByRole("link", { name: "Ver todos" }).click();
    await page.getByRole("link", { name: "Histórico y acumulados" }).click();
    await expect(page.getByRole("heading", { name: "Histórico y acumulados" })).toBeVisible();
    await expect(page.getByText(/de \d+ seleccionados/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cruzar métricas" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Jugadores acumulados" })).toBeVisible();
    await shot(page, "103-partido-historico", info.project.name);
    await expectLegibleButtons(page);

    // Un partido nuevo: nace con la plantilla convocada y abre la consola.
    await page.getByRole("link", { name: "Partidos", exact: true }).click();
    await page.getByRole("button", { name: "Nuevo partido" }).first().click();
    const newSheet = page.getByRole("dialog");
    await newSheet.getByLabel("Rival").fill(`CE Prueba ${sfx}`);
    await newSheet.getByLabel("Casa o fuera").selectOption("home");
    await shot(page, "104-partido-nuevo", info.project.name);
    await newSheet.getByRole("button", { name: "Crear partido" }).click();
    await expect(page.getByText(`Partido contra CE Prueba ${sfx} creado.`)).toBeVisible();
    await page.waitForURL(/\/matches\/[0-9a-f-]+$/);
    await expect(page.getByRole("region", { name: "Marcador y cronómetro" })).toBeVisible();
    await expect(page.getByText(`CE Prueba ${sfx}`).first()).toBeVisible();

    // Convocatoria: el quinteto inicial con la portera.
    await page.getByRole("button", { name: "Convocatoria" }).click();
    const lineup = page.getByRole("dialog");
    await expect(
      lineup.getByRole("heading", { name: "Convocatoria y quinteto inicial" }),
    ).toBeVisible();
    for (const name of ["Clara Martí", "Àlex Moreno", "Jan Garcia", "Berta Sala", "Oriol Mateu"]) {
      await lineup
        .getByRole("button", { name: new RegExp(name) })
        .first()
        .click();
    }
    await expect(lineup.getByText("5 de 5 en pista")).toBeVisible();
    await shot(page, "104b-partido-convocatoria", info.project.name);
    await lineup.getByRole("button", { name: "Guardar convocatoria" }).click();
    await expect(page.getByText("Convocatoria guardada.")).toBeVisible();
    await expect(page.getByText("En pista · 5/5")).toBeVisible();

    // Empezar: cronómetro en marcha; un gol de Oriol desde la zona central y un gol del rival.
    await page.getByRole("button", { name: "Empezar el partido" }).click();
    await expect(page.getByText("Partido en marcha.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Parar el cronómetro" })).toBeVisible();
    await page.getByRole("button", { name: "Oriol Mateu", exact: true }).click();
    await expect(page.getByText("Un toque registra la acción")).toBeVisible();
    await shot(page, "105-partido-en-directo", info.project.name);
    await expectLegibleButtons(page);
    await page.getByRole("button", { name: /^Gol\s*\+1$/ }).click();
    const zone = page.getByRole("dialog");
    await expect(zone.getByRole("heading", { name: "Gol" })).toBeVisible();
    await shot(page, "105b-partido-zona", info.project.name);
    await zone.getByRole("button", { name: "r1c2" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("Gol · Oriol Mateu")).toBeVisible();
    await page.getByRole("button", { name: "Gol del rival" }).click();
    await expect(page.getByText("Gol del rival", { exact: true }).first()).toBeVisible();

    // Oriol sigue seleccionado para encadenar acciones: se suelta con otro toque.
    await page.getByRole("button", { name: "Oriol Mateu", exact: true }).click();
    await expect(page.getByText("Toca un jugador", { exact: true })).toBeVisible();

    // Cambio en dos toques: entra Mia por Berta. Y deshacer.
    const bench = page.getByRole("region", { name: "Banquillo" });
    await bench.getByRole("button", { name: /Mia Ortega/ }).click();
    await page.getByRole("button", { name: "Berta Sala", exact: true }).click();
    await expect(page.getByText("Entra Mia Ortega por Berta Sala")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mia Ortega", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect(page.getByText("Última acción deshecha.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Berta Sala", exact: true })).toBeVisible();

    // Acabar: confirmación y a las estadísticas.
    await page.getByRole("button", { name: "Acabar el partido" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Acabar el partido" }).click();
    await expect(
      page.getByText("Partido acabado. Las estadísticas ya están listas."),
    ).toBeVisible();
    await page.waitForURL(/\/matches\/[0-9a-f-]+\/stats$/);
    await expect(page.getByRole("heading", { name: /1 – 1/ })).toBeVisible();
    await expect(page.getByText("Gol · Oriol Mateu")).toBeVisible();
    await signOut(page);
  });

  test("la entrenadora registra los partidos de su equipo; la familia ve la línea de los suyos", async ({
    page,
  }, info) => {
    await login(page, "entrenador@demo.test");
    await page.goto(`${CLUB}/sections`);
    await page.getByRole("link", { name: /Fútbol sala/ }).click();
    await page.getByRole("link", { name: "Alevín A" }).click();
    await expect(page.getByRole("heading", { name: "Partidos", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nuevo partido" })).toBeVisible();
    // Otro equipo: solo mira.
    await page.goto(`${CLUB}/sections`);
    await page.getByRole("link", { name: /Fútbol sala/ }).click();
    await page.getByRole("link", { name: "Infantil A" }).click();
    await expect(page.getByRole("heading", { name: "Partidos", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nuevo partido" })).toHaveCount(0);
    await signOut(page);

    await login(page, "familia@demo.test");
    await page.getByRole("link", { name: "Mi familia" }).first().click();
    await page.getByRole("link", { name: "Clara Martí" }).first().click();
    await page.waitForURL(/\/family\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "Partidos", exact: true })).toBeVisible();
    await expect(page.getByText("FS Castelldefels")).toBeVisible();
    await expect(page.getByText("4–3").first()).toBeVisible();
    await expect(page.getByText("Parada: 4")).toBeVisible();
    await shot(page, "106-familia-partidos", info.project.name);
    await expectLegibleButtons(page);
    await signOut(page);
  });
});
