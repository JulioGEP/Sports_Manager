import { schema, type Database } from "@sportsmanager/db";
import { LOGO_CONTENT_TYPES, type LogoContentType } from "@sportsmanager/shared";
import { getStore } from "@netlify/blobs";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { OrgScope } from "./scope.ts";

/** Lo que la plataforma usa del almacén de ficheros. Sustituible en tests por uno en memoria. */
export interface LogoStore {
  get(key: string): Promise<{ body: ArrayBuffer; contentType: string } | null>;
  set(key: string, body: ArrayBuffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Netlify Blobs (ADR 0007 y 0024). La región se fija aquí y en ningún otro sitio: los stores
 * de proyecto no siguen la región de las funciones y usarían Estados Unidos por defecto.
 * Un único store `logos` compartido por todos los deploys; la clave lleva el id del club.
 */
export function createNetlifyLogoStore(): LogoStore {
  let store: ReturnType<typeof getStore> | null = null;
  const blobs = () =>
    (store ??= getStore({ name: "logos", region: "eu-central-1", consistency: "strong" }));
  return {
    async get(key) {
      const result = await blobs().getWithMetadata(key, { type: "arrayBuffer" });
      if (!result) return null;
      const contentType = result.metadata["contentType"];
      return {
        body: result.data,
        contentType: typeof contentType === "string" ? contentType : "application/octet-stream",
      };
    },
    async set(key, body, contentType) {
      await blobs().set(key, body, { metadata: { contentType } });
    },
    async delete(key) {
      await blobs().delete(key);
    },
  };
}

export function createMemoryLogoStore(): LogoStore {
  const items = new Map<string, { body: ArrayBuffer; contentType: string }>();
  return {
    get: (key) => Promise.resolve(items.get(key) ?? null),
    set: (key, body, contentType) => {
      items.set(key, { body, contentType });
      return Promise.resolve();
    },
    delete: (key) => {
      items.delete(key);
      return Promise.resolve();
    },
  };
}

/** Tipo real del fichero por sus primeros bytes. Evita subir cualquier cosa con un content-type falso. */
export function sniffImageType(bytes: Uint8Array): LogoContentType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "image/webp";
  return null;
}

export function isLogoContentType(value: string): value is LogoContentType {
  return (LOGO_CONTENT_TYPES as readonly string[]).includes(value);
}

/** Versión pública de un logo para la URL: la parte aleatoria de la clave, sin el id del club. */
export function logoVersion(key: string): string {
  return key.split("/")[1] ?? key;
}

/**
 * Ruta pública del logo. Lleva el club en la query porque un `<img>` no manda cabeceras y, con
 * los clubes por ruta (ADR 0027), el host no identifica al club. La versión invalida la caché.
 */
export function logoUrlFor(key: string | null, slug: string): string | null {
  return key ? `/api/org/logo?club=${encodeURIComponent(slug)}&v=${logoVersion(key)}` : null;
}

export function logosRepo(db: () => Database, store: LogoStore) {
  const keyOf = async (scope: OrgScope): Promise<string | null> => {
    const rows = await db()
      .select({ key: schema.organizations.logoBlobKey })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, scope.organizationId))
      .limit(1);
    return rows[0]?.key ?? null;
  };

  return {
    keyOf,

    /** Lee el logo del club del ámbito. */
    async read(scope: OrgScope) {
      const key = await keyOf(scope);
      if (!key) return null;
      const blob = await store.get(key);
      return blob ? { key, ...blob } : null;
    },

    /**
     * Guarda un logo nuevo y lo activa. `cleanup` borra el anterior: solo en producción, porque
     * las previews comparten el store con producción y sus claves copiadas apuntan al mismo blob.
     */
    async upload(
      scope: OrgScope,
      body: ArrayBuffer,
      contentType: LogoContentType,
      options: { cleanup: boolean },
    ): Promise<string> {
      const previous = await keyOf(scope);
      const key = `${scope.organizationId}/${randomUUID()}`;
      await store.set(key, body, contentType);
      await db()
        .update(schema.organizations)
        .set({ logoBlobKey: key })
        .where(eq(schema.organizations.id, scope.organizationId));
      if (previous && options.cleanup) await store.delete(previous).catch(() => undefined);
      return key;
    },

    async remove(scope: OrgScope, options: { cleanup: boolean }): Promise<boolean> {
      const previous = await keyOf(scope);
      if (!previous) return false;
      await db()
        .update(schema.organizations)
        .set({ logoBlobKey: null })
        .where(eq(schema.organizations.id, scope.organizationId));
      if (options.cleanup) await store.delete(previous).catch(() => undefined);
      return true;
    },
  };
}
