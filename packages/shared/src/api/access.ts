import { z } from "zod";
import { ACCESS_SCOPE_KINDS, AccessAreaSchema, ConfigurableProfileSchema } from "../access.ts";

/**
 * Gestión de acceso por rol (Bloque 19, ADR 0032), solo para `org.members.manage`: qué área
 * ve cada perfil (por defecto y con las reglas del club) y las exclusiones por persona.
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

export const AccessOverviewResponseSchema = z.object({
  profiles: z.array(AccessProfileRowSchema),
  /** Personas con áreas excluidas en concreto. */
  exclusions: z.array(
    z.object({ userId: z.string(), name: z.string(), areas: z.array(AccessAreaSchema) }),
  ),
});
export type AccessOverviewResponse = z.infer<typeof AccessOverviewResponseSchema>;

/** Incluir o excluir un área para un perfil. Igual que por defecto: se borra la regla. */
export const AccessAreaUpdateSchema = z.object({ visible: z.boolean() });
export type AccessAreaUpdate = z.infer<typeof AccessAreaUpdateSchema>;

/** Las áreas que una persona concreta no ve, aunque su rol sí. Sustituye la lista. */
export const MemberExclusionsUpdateSchema = z.object({ areas: z.array(AccessAreaSchema) });
export type MemberExclusionsUpdate = z.infer<typeof MemberExclusionsUpdateSchema>;
export const MemberExclusionsResponseSchema = z.object({
  userId: z.string(),
  areas: z.array(AccessAreaSchema),
});

/** Secciones a cargo de alguien del personal (dirección, coordinación). Sustituye la lista. */
export const MemberSectionsUpdateSchema = z.object({
  sectionIds: z.array(z.string().uuid()).max(50),
});
export type MemberSectionsUpdate = z.infer<typeof MemberSectionsUpdateSchema>;
export const MemberSectionsResponseSchema = z.object({
  userId: z.string(),
  sections: z.array(z.object({ sectionId: z.string(), sectionName: z.string() })),
});
