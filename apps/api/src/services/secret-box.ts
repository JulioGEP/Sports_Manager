import type { webcrypto } from "node:crypto";

/**
 * Caja de secretos (ADR 0042): cifra las claves de API de las herramientas de cada club antes de
 * guardarlas. AES-256-GCM con Web Crypto; la clave sale del secreto de integraciones de la
 * plataforma por HKDF-SHA256, con un propósito por uso. El dato asociado (el id del club) ata el
 * cifrado a su fila: copiado a otro club, no se descifra. Formato `v1.<iv>.<cifrado>` en base64url.
 */
export interface SecretBox {
  seal(plaintext: string, associatedData: string): Promise<string>;
  /** Null si el cifrado está manipulado, es de otro club o de otro secreto. */
  open(sealed: string, associatedData: string): Promise<string | null>;
}

const VERSION = "v1";
const encoder = new TextEncoder();

export function createSecretBox(secret: string, purpose: string): SecretBox {
  let key: Promise<webcrypto.CryptoKey> | null = null;
  const keyOf = () =>
    (key ??= crypto.subtle
      .importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"])
      .then((material) =>
        crypto.subtle.deriveKey(
          {
            name: "HKDF",
            hash: "SHA-256",
            salt: encoder.encode("sportsmanager.secret-box"),
            info: encoder.encode(purpose),
          },
          material,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"],
        ),
      ));

  return {
    async seal(plaintext, associatedData) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: encoder.encode(associatedData) },
        await keyOf(),
        encoder.encode(plaintext),
      );
      return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`;
    },

    async open(sealed, associatedData) {
      const [version, iv, cipher] = sealed.split(".");
      if (version !== VERSION || !iv || !cipher) return null;
      try {
        const plain = await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: fromBase64Url(iv),
            additionalData: encoder.encode(associatedData),
          },
          await keyOf(),
          fromBase64Url(cipher),
        );
        return new TextDecoder().decode(plain);
      } catch {
        return null;
      }
    },
  };
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(value, "base64url"));
}
