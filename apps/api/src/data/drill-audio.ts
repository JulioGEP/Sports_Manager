import { schema, type Database } from "@sportsmanager/db";
import type { DrillAudioContentType } from "@sportsmanager/shared";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createNetlifyBlobStore, type BlobStore } from "./logos.ts";
import type { OrgScope } from "./scope.ts";

/** Voz de la pizarra animada (ADR 0040): store `drill-audio`, clave `<club>/<tarea>/<versión>`. */
export const createNetlifyDrillAudioStore = (): BlobStore => createNetlifyBlobStore("drill-audio");

/**
 * Ruta de la voz de una tarea. Lleva el club en la query porque un `<audio>` no manda cabeceras
 * (ADR 0027) y la versión invalida la caché al volver a grabar. La API comprueba sesión y permiso.
 */
export function drillAudioUrlFor(key: string | null, slug: string, drillId: string): string | null {
  return key
    ? `/api/org/drills/${drillId}/audio?club=${encodeURIComponent(slug)}&v=${key.split("/").at(-1) ?? ""}`
    : null;
}

export function drillAudioRepo(db: () => Database, store: BlobStore) {
  const keyOf = async (scope: OrgScope, drillId: string): Promise<string | null> => {
    const rows = await db()
      .select({ key: schema.drills.audioBlobKey })
      .from(schema.drills)
      .where(
        and(eq(schema.drills.organizationId, scope.organizationId), eq(schema.drills.id, drillId)),
      )
      .limit(1);
    return rows[0]?.key ?? null;
  };

  const setKey = (scope: OrgScope, drillId: string, key: string | null) =>
    db()
      .update(schema.drills)
      .set({ audioBlobKey: key })
      .where(
        and(eq(schema.drills.organizationId, scope.organizationId), eq(schema.drills.id, drillId)),
      );

  return {
    async read(scope: OrgScope, drillId: string) {
      const key = await keyOf(scope, drillId);
      if (!key) return null;
      const blob = await store.get(key);
      return blob ? { key, ...blob } : null;
    },

    /**
     * Guarda una voz nueva y la activa. `cleanup` borra la anterior: solo en producción, porque
     * las previews comparten el store con producción y sus claves copiadas apuntan al mismo blob.
     */
    async upload(
      scope: OrgScope,
      drillId: string,
      body: ArrayBuffer,
      contentType: DrillAudioContentType,
      options: { cleanup: boolean },
    ): Promise<string> {
      const previous = await keyOf(scope, drillId);
      const key = `${scope.organizationId}/${drillId}/${randomUUID()}`;
      await store.set(key, body, contentType);
      await setKey(scope, drillId, key);
      if (previous && options.cleanup) await store.delete(previous).catch(() => undefined);
      return key;
    },

    async remove(
      scope: OrgScope,
      drillId: string,
      options: { cleanup: boolean },
    ): Promise<boolean> {
      const previous = await keyOf(scope, drillId);
      if (!previous) return false;
      await setKey(scope, drillId, null);
      if (options.cleanup) await store.delete(previous).catch(() => undefined);
      return true;
    },
  };
}
