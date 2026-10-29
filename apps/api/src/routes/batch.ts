import { VIEW_AS_HEADER } from "@sportsmanager/shared";
import type { Hono } from "hono";
import { z } from "@hono/zod-openapi";
import type { AppEnv } from "../http/context.ts";
import { ApiError, badRequest } from "../http/errors.ts";
import type { BatchMemo } from "../http/memo.ts";
import { CLUB_HEADER } from "../tenancy.ts";

/** Peticiones por lote. La web parte las colas más largas. */
export const BATCH_MAX = 20;

const BatchRequestSchema = z.object({
  requests: z
    .array(
      z.object({
        path: z.string().min(5).max(2048),
        /** Solo el club y "ver como" pueden cambiar de una petición a otra; el resto es del lote. */
        headers: z
          .object({
            [CLUB_HEADER]: z.string().max(64).optional(),
            [VIEW_AS_HEADER]: z.string().max(64).optional(),
          })
          .optional(),
      }),
    )
    .min(1)
    .max(BATCH_MAX),
});

/** Lo que no se agrupa: la sesión (Better Auth), los webhooks, la documentación y el propio lote. */
const NOT_BATCHABLE = /^\/api\/(auth|batch|webhooks|docs|openapi\.json)(\/|$)/;

/** Cabeceras de la petición exterior que no pasan a las de dentro (las fija cada una). */
const OUTER_ONLY = ["content-type", "content-length", CLUB_HEADER, VIEW_AS_HEADER];

/**
 * Lote de lecturas (ADR 0060): `POST /api/batch` con varias GET de la API que se resuelven en la
 * misma invocación de la función, en paralelo y con la misma cookie. Cada pantalla pide 3 a 6
 * cosas a la vez; en Netlify cada petición suelta es una invocación propia, y cada invocación sin
 * una instancia caliente libre paga un arranque en frío. Con el lote, una pantalla es una sola.
 *
 * Cada petición de dentro recorre la cadena completa de la API (club, sesión, actor y permisos)
 * como si llegara sola; el memo del lote solo evita repetir las mismas consultas. Solo GET: nada
 * de lo que va en un lote cambia datos.
 *
 * Respuesta: `{ responses: [{ status, body }] }` en el mismo orden, con el cuerpo JSON de cada una.
 */
export function registerBatchRoute(app: Hono<AppEnv>) {
  app.post("/api/batch", async (c) => {
    // Solo JSON: desde otro origen obliga a una comprobación previa del navegador (CORS).
    if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json"))
      throw badRequest("El lote se manda como JSON.");
    const parsed = BatchRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw badRequest("Lote no válido.", parsed.error.issues);

    const outer = new URL(c.req.url);
    const base = new Headers(c.req.raw.headers);
    for (const name of OUTER_ONLY) base.delete(name);
    base.set("accept", "application/json");
    const env = { ...c.env, memo: new Map() as BatchMemo };

    const responses = await Promise.all(
      parsed.data.requests.map(async ({ path, headers }): Promise<string> => {
        const url = new URL(path, outer.origin);
        if (
          url.origin !== outer.origin ||
          !url.pathname.startsWith("/api/") ||
          NOT_BATCHABLE.test(url.pathname)
        ) {
          return line(400, badRequest("Esta petición no puede ir en un lote.").toBody());
        }
        const inner = new Headers(base);
        for (const [name, value] of Object.entries(headers ?? {})) {
          if (value) inner.set(name, value);
        }
        try {
          const res = await app.fetch(new Request(url, { method: "GET", headers: inner }), env);
          const text = await res.text();
          const json = res.headers.get("content-type")?.includes("application/json");
          // El cuerpo ya es JSON: se incrusta tal cual, sin volver a parsearlo y serializarlo.
          return `{"status":${res.status},"body":${json && text ? text : "null"}}`;
        } catch (error) {
          console.error("[api] batch item failed", error);
          return line(500, new ApiError(500, "internal", "Error inesperado.").toBody());
        }
      }),
    );
    return c.body(`{"responses":[${responses.join(",")}]}`, 200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
  });
}

function line(status: number, body: unknown): string {
  return JSON.stringify({ status, body });
}
