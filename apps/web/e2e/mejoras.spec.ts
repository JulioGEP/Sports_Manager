import { expect, test, type Page } from "@playwright/test";
import { CLUB, expectLegibleButtons, login, shot } from "./helpers";

/**
 * Mejoras de la plataforma (ADR 0047), en la pestaña Mejoras de Ajustes (ADR 0048), con el club
 * demo, cuya administración (`admin@demo.test`) también administra la plataforma en estas pruebas.
 * La plataforma tiene una hoja de ruta; el club la ve, vota y sugiere dos mejoras (una que ya
 * estaba, con el aviso de parecidas, y otra nueva); la plataforma une la repetida, planifica la
 * nueva con fecha aproximada, contesta y la ordena; y el club ve en qué ha quedado cada una.
 * Escritorio y móvil comparten base: cada uno sugiere y vota lo suyo.
 */

interface Seed {
  title: string;
  body: string;
  area: string;
  status: "open" | "planned" | "in_progress" | "released";
  eta: string | null;
}

/** Trimestre `offset` desde hoy, como lo guarda la API (2027-Q1) y como lo lee el club (T1 2027). */
function quarter(offset: number) {
  const now = new Date();
  const index = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3) + offset;
  const year = Math.floor(index / 4);
  const q = (index % 4) + 1;
  return { value: `${year}-Q${q}`, label: `T${q} ${year}` };
}

const ROADMAP: Seed[] = [
  {
    title: "Agenda del club en el calendario del móvil",
    body: "Suscribirse a la agenda del equipo desde Google Calendar o el calendario del iPhone.",
    area: "agenda",
    status: "in_progress",
    eta: quarter(0).value,
  },
  {
    title: "Convocatorias con confirmación de asistencia",
    body: "La familia confirma desde el aviso si viene o no, y el cuerpo técnico lo ve al momento.",
    area: "communication",
    status: "planned",
    eta: quarter(1).value,
  },
  {
    title: "Pagos con Bizum",
    body: "Pagar las cuotas y los pedidos de la tienda con Bizum.",
    area: "fees",
    status: "planned",
    eta: quarter(2).value,
  },
  {
    title: "Exportar los socios a Excel",
    body: "Con sus datos de contacto, su tipo de socio y su cuota.",
    area: "people",
    status: "open",
    eta: null,
  },
  {
    title: "Estadísticas de la temporada por jugador",
    body: "Minutos, goles y valoraciones de toda la temporada en una ficha.",
    area: "matches",
    status: "open",
    eta: null,
  },
  {
    title: "Tienda del club",
    body: "Ropa, material y extras con stock por talla, cobrados como una cuota.",
    area: "store",
    status: "released",
    eta: null,
  },
];

/** La hoja de ruta de partida, creada una sola vez aunque corran escritorio y móvil. */
async function ensureRoadmap(page: Page) {
  const res = await page.request.get("/api/platform/suggestions");
  expect(res.ok()).toBe(true);
  const { suggestions } = (await res.json()) as { suggestions: { publicTitle: string | null }[] };
  const existing = new Set(suggestions.map((s) => s.publicTitle));
  for (const seed of ROADMAP) {
    if (existing.has(seed.title)) continue;
    const created = await page.request.post("/api/platform/suggestions", { data: seed });
    expect(created.status()).toBe(201);
  }
}

const PER_PROJECT = {
  escritorio: {
    vote: "Estadísticas de la temporada por jugador",
    duplicate: "Exportar los socios a Excel para el seguro",
    fresh: "Firmar la autorización de imagen desde el móvil",
    freshArea: "Familias",
    freshPublic: "Autorización de imagen firmada desde el móvil",
    freshBody:
      "La familia firma la autorización de imagen de cada deportista desde el móvil, sin papel.",
  },
  movil: {
    vote: "Pagos con Bizum",
    duplicate: "Sacar los socios en un Excel para la federación",
    fresh: "Recordatorio de cuotas pendientes por email",
    freshArea: "Cuotas y cobros",
    freshPublic: "Recordatorio automático de cuotas pendientes",
    freshBody:
      "Un email a la familia unos días antes de que venza una cuota y otro si se queda sin pagar.",
  },
} as const;

test.describe("mejoras de la plataforma", () => {
  test("el club ve la hoja de ruta, vota y sugiere; la plataforma une, planifica y contesta", async ({
    page,
  }, info) => {
    const p = PER_PROJECT[info.project.name as keyof typeof PER_PROJECT];
    await login(page);
    await ensureRoadmap(page);

    // --- El club: Mejoras es una pestaña de Ajustes (ADR 0048), no una entrada de la barra ---
    await expect(page.getByRole("link", { name: "Mejoras", exact: true })).toHaveCount(0);
    await page.goto(`${CLUB}/settings`);
    await page.getByRole("tab", { name: "Mejoras" }).click();
    await page.waitForURL(/\/settings\?tab=improvements/);
    await expect(page.getByRole("tab", { name: "Mejoras" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("heading", { name: "Sugerencias del club" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lo que viene" })).toBeVisible();
    await expect(
      page.getByText("Agenda del club en el calendario del móvil").first(),
    ).toBeVisible();
    await expect(page.getByText(quarter(1).label).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "En estudio" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ya disponible" })).toBeVisible();
    await shot(page, "140-mejoras-hoja-de-ruta", info.project.name);
    await expectLegibleButtons(page);

    // Votar desde el detalle.
    await page.getByText(p.vote).first().click();
    const detail = page.getByRole("dialog");
    await expect(detail.getByRole("heading", { name: p.vote })).toBeVisible();
    await detail.getByRole("button", { name: "Votar esta mejora" }).click();
    await expect(page.getByText(`Voto guardado para «${p.vote}».`)).toBeVisible();
    await expect(detail.getByRole("button", { name: "Quitar mi voto" })).toBeVisible();
    await expect(detail.getByText("Tu club la ha votado")).toBeVisible();
    await shot(page, "141-mejoras-detalle", info.project.name);
    await detail.getByRole("button", { name: "Cerrar" }).first().click();

    // Sugerir una que ya está: el formulario avisa de la parecida.
    await page.getByRole("button", { name: "Sugerir una mejora" }).click();
    let form = page.getByRole("dialog");
    await form.getByLabel("Qué te gustaría poder hacer").fill(p.duplicate);
    await expect(form.getByText("Puede que ya esté en la hoja de ruta")).toBeVisible();
    await expect(form.getByText("Exportar los socios a Excel", { exact: true })).toBeVisible();
    await form.getByLabel("Parte de la aplicación").selectOption({ label: "Socios y personal" });
    await form
      .getByLabel("Para qué lo necesitas")
      .fill("El seguro nos pide cada trimestre la lista de socios con su DNI y su cuota.");
    await shot(page, "142-mejoras-sugerir", info.project.name);
    await expectLegibleButtons(page);
    await form.getByRole("button", { name: "Enviar sugerencia" }).click();
    await expect(page.getByText("Sugerencia enviada. Aquí verás en qué queda.")).toBeVisible();
    await page.waitForURL(/tab=improvements&mine=/);
    let sent = page.getByRole("dialog");
    await expect(sent.getByRole("heading", { name: p.duplicate })).toBeVisible();
    await expect(
      sent.getByText("Recibida. La plataforma la revisará y te contestará aquí."),
    ).toBeVisible();
    await sent.getByRole("button", { name: "Cerrar" }).first().click();

    // Y otra nueva.
    await page.getByRole("button", { name: "Sugerir una mejora" }).first().click();
    form = page.getByRole("dialog");
    await form.getByLabel("Qué te gustaría poder hacer").fill(p.fresh);
    await form.getByLabel("Parte de la aplicación").selectOption({ label: p.freshArea });
    await form
      .getByLabel("Para qué lo necesitas")
      .fill("Hoy lo hacemos en papel al empezar la temporada y se pierden la mitad.");
    await form.getByRole("button", { name: "Enviar sugerencia" }).click();
    await expect(page.getByText("Sugerencia enviada. Aquí verás en qué queda.")).toBeVisible();
    sent = page.getByRole("dialog");
    await expect(sent.getByRole("heading", { name: p.fresh })).toBeVisible();
    await sent.getByRole("button", { name: "Cerrar" }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Mejoras" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText(p.fresh).first()).toBeVisible();
    await shot(page, "143-mejoras-sugerencias-del-club", info.project.name);

    // --- La plataforma: revisar ---
    await page.goto("/admin/suggestions");
    await expect(page.getByRole("heading", { name: "Mejoras", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Por revisar/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText(p.duplicate).first()).toBeVisible();
    await expect(page.getByText(/Club de demostración/).first()).toBeVisible();
    await shot(page, "144-negocio-mejoras-por-revisar", info.project.name);
    await expectLegibleButtons(page);

    // La repetida se une a la que ya estaba: sus votos pasan allí.
    await page.getByText(p.duplicate).first().click();
    let review = page.getByRole("dialog");
    await expect(review.getByRole("heading", { name: "Revisar sugerencia" })).toBeVisible();
    await expect(review.getByText("Pedida por Club de demostración")).toBeVisible();
    await review.getByLabel("Estado").selectOption({ label: "Unida a otra" });
    await review
      .getByLabel("Unir a")
      .selectOption({ label: "Exportar los socios a Excel · En estudio" });
    await review.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Sugerencia guardada: unida a otra.")).toBeVisible();

    // La nueva se planifica con fecha aproximada, versión pública y respuesta al club.
    await page.goto("/admin/suggestions");
    await page.getByText(p.fresh).first().click();
    review = page.getByRole("dialog");
    await review.getByLabel("Estado").selectOption({ label: "Planificada" });
    await review.getByLabel("Título público").fill(p.freshPublic);
    await review.getByLabel("Descripción pública").fill(p.freshBody);
    await review.getByLabel("Fecha aproximada").selectOption(quarter(2).value);
    await review
      .getByLabel("Respuesta al club")
      .fill("Buena idea. La planificamos para después de los pagos con Bizum.");
    await shot(page, "145-negocio-mejoras-revisar", info.project.name);
    await expectLegibleButtons(page);
    await review.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Sugerencia guardada: planificada.")).toBeVisible();
    await page.waitForURL(/tab=roadmap/);
    await expect(page.getByRole("heading", { name: "Lo que viene" })).toBeVisible();

    // Entra al final de lo que viene; se sube un puesto.
    const coming = page.locator("table, ul").filter({ hasText: p.freshPublic }).first();
    const titles = async () =>
      (await coming.locator("tr, li").allInnerTexts()).map((text) =>
        [
          ...ROADMAP.map((r) => r.title),
          ...Object.values(PER_PROJECT).map((x) => x.freshPublic),
        ].find((title) => text.includes(title)),
      );
    const before = (await titles()).filter(Boolean);
    expect(before.at(-1)).toBe(p.freshPublic);
    await coming
      .locator("tr, li")
      .filter({ hasText: p.freshPublic })
      .getByRole("button", { name: "Subir" })
      .click();
    await expect
      .poll(async () => (await titles()).filter(Boolean))
      .toEqual([...before.slice(0, -2), p.freshPublic, before.at(-2)]);
    await shot(page, "146-negocio-mejoras-hoja-de-ruta", info.project.name);

    // --- El club: en qué ha quedado cada una ---
    // La dirección de antes (`/roadmap`, ADR 0047) lleva a la pestaña.
    await page.goto(`${CLUB}/roadmap`);
    await page.waitForURL(/\/settings\?tab=improvements$/);
    await page.getByText(p.duplicate).first().click();
    let mine = page.getByRole("dialog");
    await expect(
      mine.getByText(
        "Pide lo mismo que «Exportar los socios a Excel» y se han unido: tu voto cuenta ahí.",
      ),
    ).toBeVisible();
    await mine.getByRole("button", { name: "Cerrar" }).first().click();

    await page.getByText(p.fresh).first().click();
    mine = page.getByRole("dialog");
    await expect(mine.getByText("Planificada", { exact: true })).toBeVisible();
    await expect(
      mine.getByText("Buena idea. La planificamos para después de los pagos con Bizum."),
    ).toBeVisible();
    await expect(mine.getByText(p.freshPublic)).toBeVisible();
    await expect(mine.getByText(quarter(2).label)).toBeVisible();
    await shot(page, "147-mejoras-respuesta", info.project.name);
    await expectLegibleButtons(page);
    await mine.getByRole("button", { name: "Ver en la hoja de ruta" }).click();
    await expect(page.getByRole("dialog").getByText("Pedida por tu club")).toBeVisible();
  });
});
