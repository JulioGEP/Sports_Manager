import { z } from "zod";
import { ACCESS_SCOPE_KINDS, AccessAreaSchema, ConfigurableProfileSchema } from "../access.ts";

/**
 * Gestión de acceso por rol (Bloque 19, ADR 0033), solo para `org.members.manage`: qué área
 * ve cada perfil (por defecto y con las reglas del club) y las excepciones por persona (ADR 0036).
 */

export const AccessProfileRowSchema = z.object({
  profile: ConfigurableProfileSchema,
  scope: z.enum(ACCESS_SCOPE_KINDS),
  areas: z.array(
    z.object({
      area: AccessAreaSchema,
      /** Lo que ve sin reglas: lo que dicen el rol y el cargo. */
      default: z.boolean(),
      /** Lo que ve con las reglas del club. Distinto de `default` cuando hay una regla. */
      visible: z.boolean(),
    }),
  ),
});
export type AccessProfileRow = z.infer<typeof AccessProfileRowSchema>;

/** Excepciones de una persona: lo que ve aunque su rol no (`allow`) y lo que no ve aunque su rol sí (`deny`). */
export const AccessOverridesSchema = z.object({
  allow: z.array(AccessAreaSchema),
  deny: z.array(AccessAreaSchema),
});
export type AccessOverrides = z.infer<typeof AccessOverridesSchema>;

export const AccessOverviewResponseSchema = z.object({
  profiles: z.array(AccessProfileRowSchema),
  /** Personas con excepciones: ven algo distinto de lo que ve su rol. */
  people: z.array(
    AccessOverridesSchema.extend({
      userId: z.string(),
      name: z.string(),
      /** Lo que ve por su rol, sin sus excepciones: para enseñarlo al editarlas. */
      byRole: z.array(AccessAreaSchema),
    }),
  ),
});
export type AccessOverviewResponse = z.infer<typeof AccessOverviewResponseSchema>;

/** Incluir o excluir un área para un perfil. Igual que por defecto: se borra la regla. */
export const AccessAreaUpdateSchema = z.object({ visible: z.boolean() });
export type AccessAreaUpdate = z.infer<typeof AccessAreaUpdateSchema>;

/**
 * Lo que una persona concreta ve: la lista completa de áreas. La API la compara con lo que ve por
 * su rol y guarda solo las diferencias como excepciones; igual que su rol, no queda ninguna.
 */
export const MemberAccessUpdateSchema = z.object({ visible: z.array(AccessAreaSchema) });
export type MemberAccessUpdate = z.infer<typeof MemberAccessUpdateSchema>;
export const MemberAccessResponseSchema = AccessOverridesSchema.extend({
  userId: z.string(),
  /** Lo que ve por su rol, para que la web enseñe la diferencia. */
  byRole: z.array(AccessAreaSchema),
});
export type MemberAccessResponse = z.infer<typeof MemberAccessResponseSchema>;

/** Secciones a cargo de alguien del personal (dirección, coordinación). Sustituye la lista. */
export const MemberSectionsUpdateSchema = z.object({
  sectionIds: z.array(z.string().uuid()).max(50),
});
export type MemberSectionsUpdate = z.infer<typeof MemberSectionsUpdateSchema>;
export const MemberSectionsResponseSchema = z.object({
  userId: z.string(),
  sections: z.array(z.object({ sectionId: z.string(), sectionName: z.string() })),
});
