import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DrillResponse } from "@sportsmanager/shared";
import { CLUB, expectLegibleButtons, login, shot, suffix } from "./helpers";

/**
 * Pizarra animada (ADR 0040): las piezas se arrastran, el movimiento se graba por capas con la
 * voz de quien lo explica (micrófono simulado de Chromium) y se reproduce en la ficha de la
 * tarea. La API guarda la trayectoria de cada pieza y sirve la voz a quien ve la tarea.
 */

/** Un punto de la pizarra en porcentaje (0 a 100) llevado a la pantalla. */
async function at(board: Locator, x: number, y: number) {
  await board.scrollIntoViewIfNeeded();
  const box = await board.boundingBox();
  if (!box) throw new Error("la pizarra no se ve");
  return { x: box.x + (box.width * x) / 100, y: box.y + (box.height * y) / 100 };
}

/** Arrastra de un punto a otro poco a poco, como una mano: así la grabación tiene tiempo. */
async function drag(page: Page, board: Locator, from: [number, number], to: [number, number]) {
  const a = await at(board, ...from);
  const b = await at(board, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / 15, a.y + ((b.y - a.y) * i) / 15);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
}

async function drillFromApi(page: Page, id: string) {
  const res = await page.request.get(`/api/org/drills/${id}`, { headers: { "x-sm-club": "demo" } });
  expect(res.status()).toBe(200);
  return ((await res.json()) as DrillResponse).drill;
}

test.describe("pizarra animada", () => {
  test("se arrastra, graba el movimiento por capas con voz y lo reproduce", async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    const sfx = suffix(info.project.name);
    await login(page, "senior@demo.test", "123456");
    await page.goto(`${CLUB}/drills/new`);
    await expect(page.getByRole("heading", { name: "Nueva tarea" })).toBeVisible();
    await page.getByLabel("Nombre", { exact: true }).fill(`Jugada animada ${sfx}`);

    // Dos jugadores y el balón, puestos con un toque.
    const board = page.getByRole("img", { name: /^Pizarra con/ });
    for (const [x, y] of [
      [30, 40],
      [30, 75],
    ] as const) {
      const p = await at(board, x, y);
      await page.mouse.click(p.x, p.y);
    }
    await page.getByRole("button", { name: "Balón", exact: true }).click();
    const ball = await at(board, 50, 20);
    await page.mouse.click(ball.x, ball.y);
    await expect(page.getByRole("img", { name: "Pizarra con 3 piezas y 0 flechas" })).toBeVisible();

    // Arrastrar fuera de la grabación cambia la posición de salida.
    await drag(page, board, [50, 20], [35, 40]);

    // Primera capa, con voz: el jugador 1 conduce hacia la portería.
    await page.getByLabel("Con voz").check();
    await page.getByRole("button", { name: "Grabar movimiento" }).click();
    await expect(page.getByText(/^Grabando \d:\d\d$/)).toBeVisible();
    await drag(page, board, [30, 40], [70, 45]);
    await drag(page, board, [35, 40], [75, 45]);
    await page.getByRole("button", { name: "Parar" }).click();
    await expect(page.getByText(/^Jugada de \d+ s\.$/)).toBeVisible();
    await expect(page.getByText("Voz nueva: se guarda con la tarea.")).toBeVisible();

    // Segunda capa, sin voz: el jugador 2 acompaña mientras se reproduce lo anterior.
    await page.getByLabel("Con voz").uncheck();
    await page.getByRole("button", { name: "Grabar otra capa" }).click();
    await drag(page, board, [30, 75], [60, 65]);
    await page.getByRole("button", { name: "Parar" }).click();

    // Reproducir: el botón pasa a pausa mientras dura.
    await page.getByRole("button", { name: "Reproducir" }).click();
    await expect(page.getByRole("button", { name: "Pausa" })).toBeVisible();
    await shot(page, "220-pizarra-grabada", info.project.name);
    await page.getByRole("button", { name: "Pausa" }).click();
    await expectLegibleButtons(page);

    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Tarea creada.")).toBeVisible();
    await expect(page.getByRole("heading", { name: `Jugada animada ${sfx}` })).toBeVisible();
    const id = page.url().split("/").at(-1)!;

    // La API guarda la salida, una pista por pieza movida y la voz, y la sirve a quien ve la tarea.
    const saved = await drillFromApi(page, id);
    expect(saved.diagram?.pieces).toHaveLength(3);
    expect(saved.diagram?.pieces[2]?.x).toBeCloseTo(35, 0);
    expect(saved.diagram?.animation?.tracks.map((t) => t.piece).sort()).toEqual([0, 1, 2]);
    expect(saved.diagram?.animation?.durationMs).toBeGreaterThan(1000);
    expect(saved.audioUrl).toMatch(new RegExp(`/api/org/drills/${id}/audio\\?club=demo&v=`));
    const voice = await page.request.get(saved.audioUrl!);
    expect(voice.status()).toBe(200);
    expect(voice.headers()["content-type"]).toMatch(/^audio\//);

    // La ficha reproduce la jugada con su voz.
    const player = page.getByRole("group", { name: "Reproductor de la jugada" });
    await expect(player.getByText("Con voz")).toBeVisible();
    // Parada, la pizarra enseña por dónde va cada pieza.
    await shot(page, "221-pizarra-trayectorias", info.project.name);
    await player.getByRole("button", { name: "Reproducir" }).click();
    await expect(player.getByRole("button", { name: "Pausa" })).toBeVisible();
    await page.waitForTimeout(900);
    await player.getByRole("button", { name: "Pausa" }).click();
    await shot(page, "222-pizarra-reproduccion", info.project.name);

    // Teclado: se elige una pieza de la lista y se mueve con las flechas, con su trayectoria.
    await page.getByRole("button", { name: "Editar" }).first().click();
    const chip = page.getByRole("button", { name: "Jugador 1: elígelo y muévelo con las flechas" });
    await chip.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Tarea guardada.")).toBeVisible();
    const moved = await drillFromApi(page, id);
    expect(moved.diagram!.pieces[0]!.x).toBeCloseTo(saved.diagram!.pieces[0]!.x + 2, 1);
    const before = saved.diagram!.animation!.tracks.find((t) => t.piece === 0)!.points[0]!;
    const after = moved.diagram!.animation!.tracks.find((t) => t.piece === 0)!.points[0]!;
    expect(after[1]).toBeCloseTo(Math.min(100, before[1] + 2), 1);
    expect(moved.audioUrl).toBe(saved.audioUrl);
  });
});
