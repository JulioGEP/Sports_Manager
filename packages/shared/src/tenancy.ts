import { z } from "zod";

/**
 * Nombres que nunca pueden ser un club (ADR 0011 y 0027): sirven como subdominio reservado y,
 * mientras los clubes viven en una ruta del dominio base (`/demo`), como primer segmento de
 * la ruta. `admin` aloja el panel del negocio; el resto son rutas de la web o de la API.
 */
export const RESERVED_SUBDOMAINS = [
  "www",
  "admin",
  "api",
  "app",
  "staging",
  "mail",
  "login",
  "clubs",
  "invitations",
  "forgot-password",
  "reset-password",
  "assets",
  "static",
] as const;
export type ReservedSubdomain = (typeof RESERVED_SUBDOMAINS)[number];

export function isReservedSubdomain(value: string): value is ReservedSubdomain {
  return (RESERVED_SUBDOMAINS as readonly string[]).includes(value);
}

/**
 * Formato de slug de organización. Coincide con las restricciones de una etiqueta DNS:
 * minúsculas, dígitos y guiones, sin guion inicial ni final, máximo 63 caracteres.
 */
export const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const OrganizationSlugSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(ORGANIZATION_SLUG_PATTERN, "Slug inválido: minúsculas, dígitos y guiones.")
  .refine((slug) => !isReservedSubdomain(slug), "Este subdominio está reservado.");

export type OrganizationSlug = z.infer<typeof OrganizationSlugSchema>;

/**
 * Extrae la primera etiqueta de un host y la devuelve como candidato a slug.
 * `club.sportsmanager.com` → `club`. `club.sportsmanager.localhost:8888` → `club`.
 * Devuelve null si el host no tiene al menos tres etiquetas (no hay subdominio).
 */
export function subdomainFromHost(host: string, baseDomain: string): string | null {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const base = baseDomain.toLowerCase();
  if (!hostname.endsWith(`.${base}`)) return null;
  const prefix = hostname.slice(0, hostname.length - base.length - 1);
  if (prefix === "" || prefix.includes(".")) return null;
  return prefix;
}

/** Propone un slug a partir de un nombre: minúsculas, sin acentos, guiones, máximo 63. */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}
