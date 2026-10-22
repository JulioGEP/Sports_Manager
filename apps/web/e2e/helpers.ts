import { expect, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

export const DEMO = { email: "admin@demo.test", password: "123456" };

const dir = fileURLToPath(new URL("./screenshots/", import.meta.url));
mkdirSync(dir, { recursive: true });

/**
 * Captura de página completa con nombre estable, por proyecto (escritorio o móvil).
 * Antes comprueba que nada desborda en horizontal: en móvil eso ensancha la página y descoloca
 * los paneles. `scale: "css"` guarda un píxel por píxel CSS para que las capturas pesen poco.
 */
export async function shot(page: Page, name: string, project: string) {
  await page.waitForLoadState("networkidle");
  await expectNoHorizontalOverflow(page, name);
  await page.screenshot({
    path: join(dir, `${project}-${name}.png`),
    fullPage: true,
    animations: "disabled",
    scale: "css",
  });
}

export async function expectNoHorizontalOverflow(page: Page, label: string) {
  const viewport = page.viewportSize();
  if (!viewport) return;
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth, `la pantalla "${label}" desborda en horizontal`).toBeLessThanOrEqual(
    viewport.width,
  );
}

/** El club demo vive en /demo (ADR 0027). */
export const CLUB = "/demo";

/** Entra y espera a estar dentro de un club (con un solo club, el selector va directo). */
export async function login(
  page: Page,
  email = DEMO.email,
  password = DEMO.password,
  next: string = CLUB,
) {
  // Con `next` la entrada vuelve siempre al club demo, aunque la cuenta ya pertenezca a más clubes
  // creados por otras pruebas de la misma ejecución (escritorio y móvil comparten base).
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel(/email|correo/i).fill(email);
  await page.getByLabel(/contraseña|contrasenya|password/i).fill(password);
  await page.getByRole("button", { name: /^(entrar|sign in)$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Abre el menú de persona y cierra la sesión. */
export async function signOut(page: Page) {
  await page.getByRole("button", { name: /menú de usuario|user menu/i }).click();
  await page.getByRole("menuitem", { name: /cerrar sesión|sign out/i }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/login"));
}

/**
 * Logo de prueba generado en memoria (PNG RGBA de 96x96: un círculo claro sobre fondo verde),
 * para que la subida de logo se vea en las capturas sin guardar binarios en el repo.
 */
export const TEST_LOGO_PNG = encodePng(96, 96, (x, y) => {
  const dx = x - 48;
  const dy = y - 48;
  const inside = dx * dx + dy * dy <= 30 * 30;
  return inside ? [255, 255, 255, 255] : [22, 163, 74, 255];
});

function encodePng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number],
): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtro "none" por fila
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const offset = y * (width * 4 + 1) + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // profundidad de bit
  header[9] = 6; // color RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Sufijo único por proyecto para que escritorio y móvil no choquen con los mismos datos. */
export function suffix(project: string): string {
  return project.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/**
 * Ningún botón ni enlace con aspecto de botón puede ser ilegible: el color del texto
 * tiene que distinguirse del fondo. Es la prueba que evita botones blancos sobre blanco.
 */
export async function expectLegibleButtons(page: Page) {
  const buttons: Locator = page.locator("button, a[href], label");
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    if (!(await button.isVisible())) continue;
    const { color, background, text } = await button.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        color: style.color,
        background: style.backgroundColor,
        text: (el.textContent ?? "").trim(),
      };
    });
    if (!text) continue;
    expect(color, `botón "${text}" con texto del mismo color que el fondo`).not.toBe(background);
    expect(color, `botón "${text}" con texto transparente`).not.toBe("rgba(0, 0, 0, 0)");
  }
}

/**
 * Confirmación abierta (DESIGN.md 9.12). Sus botones se leen sobre el fondo que de verdad tienen
 * detrás (un botón sin fondo propio deja ver el del diálogo) y, en Precisa, es un diálogo centrado
 * y estrecho con los botones en una fila, no un panel a todo el ancho con botones de lado a lado.
 */
export async function expectConfirmDialog(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const buttons = await dialog.getByRole("button").all();
  for (const button of buttons) {
    const { color, background, text } = await button.evaluate((el) => {
      let node: Element | null = el;
      let background = "rgba(0, 0, 0, 0)";
      while (node && background === "rgba(0, 0, 0, 0)") {
        background = getComputedStyle(node).backgroundColor;
        node = node.parentElement;
      }
      return {
        color: getComputedStyle(el).color,
        background,
        text: (el.textContent ?? "").trim(),
      };
    });
    expect(color, `botón "${text}" del diálogo sin contraste con su fondo`).not.toBe(background);
  }

  const shape = await page.evaluate(() => document.documentElement.dataset["shape"]);
  if (shape !== "precisa") return;
  const viewport = page.viewportSize()!;
  const box = (await dialog.boundingBox())!;
  expect(box.width, "el diálogo de confirmación ocupa todo el ancho").toBeLessThan(
    viewport.width / 2,
  );
  const tops = await Promise.all(buttons.map(async (b) => (await b.boundingBox())!.y));
  expect(new Set(tops).size, "los botones del diálogo no van en una fila").toBe(1);
}

/** Parte de la URL del enlace de invitación que muestra la interfaz en modo pruebas. */
export async function readInvitationLink(page: Page): Promise<string> {
  const code = page.locator("code", { hasText: "/invitations/" }).first();
  await expect(code).toBeVisible();
  return (await code.textContent())!.trim();
}
