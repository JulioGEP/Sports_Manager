import { describe, expect, it } from "vitest";
import { createMemoryLogoStore, logoUrlFor, logoVersion, sniffImageType } from "./logos.ts";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("logos", () => {
  it("reconoce el tipo real por los primeros bytes", () => {
    expect(sniffImageType(png)).toBe("image/png");
    expect(sniffImageType(jpeg)).toBe("image/jpeg");
    expect(sniffImageType(webp)).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<svg></svg>"))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x89, 0x50]))).toBeNull();
  });

  it("la URL pública lleva solo la parte aleatoria de la clave, nunca el id del club", () => {
    const key = "11111111-1111-1111-1111-111111111111/abcd-efgh";
    expect(logoVersion(key)).toBe("abcd-efgh");
    expect(logoUrlFor(key)).toBe("/api/org/logo?v=abcd-efgh");
    expect(logoUrlFor(null)).toBeNull();
  });

  it("el almacén en memoria guarda, devuelve y borra", async () => {
    const store = createMemoryLogoStore();
    await store.set("k", png.buffer.slice(0), "image/png");
    const got = await store.get("k");
    expect(got?.contentType).toBe("image/png");
    expect(got?.body.byteLength).toBe(png.byteLength);
    await store.delete("k");
    expect(await store.get("k")).toBeNull();
  });
});
