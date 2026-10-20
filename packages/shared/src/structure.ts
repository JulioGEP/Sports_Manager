import { z } from "zod";
import { LocaleSchema } from "./locales.ts";
import { EmailSchema } from "./users.ts";

/**
 * Estructura del club (Fase 1, Bloque 11, ADR 0028): temporadas, secciones, equipos con su
 * plantilla por temporada, jugadores y sus familias. Los catálogos de estados y relaciones son
 * listas en código que la base convierte en restricciones CHECK (docs/modelo-datos.md).
 */

/** Fecha de calendario sin hora, `AAAA-MM-DD`. Las fechas de nacimiento y de temporada no llevan zona. */
export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida: usa el formato AAAA-MM-DD.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Fecha inválida.");

const ShortName = z.string().trim().min(1).max(60);

// --- Temporadas ---

export const SeasonCreateSchema = z
  .object({
    name: ShortName,
    startsOn: DateOnlySchema,
    endsOn: DateOnlySchema,
    /** Al crearla como actual, la anterior deja de serlo. */
    isCurrent: z.boolean().optional(),
  })
  .refine((s) => s.startsOn < s.endsOn, {
    message: "La temporada tiene que acabar después de empezar.",
    path: ["endsOn"],
  });
export type SeasonCreate = z.infer<typeof SeasonCreateSchema>;

export const SeasonUpdateSchema = z.object({
  name: ShortName.optional(),
  startsOn: DateOnlySchema.optional(),
  endsOn: DateOnlySchema.optional(),
  isCurrent: z.literal(true).optional(),
});
export type SeasonUpdate = z.infer<typeof SeasonUpdateSchema>;

// --- Secciones ---

export const SECTION_STATUSES = ["active", "archived"] as const;
export type SectionStatus = (typeof SECTION_STATUSES)[number];

export const SectionCreateSchema = z.object({ name: ShortName });
export type SectionCreate = z.infer<typeof SectionCreateSchema>;
export const SectionUpdateSchema = z.object({
  name: ShortName.optional(),
  status: z.enum(SECTION_STATUSES).optional(),
});
export type SectionUpdate = z.infer<typeof SectionUpdateSchema>;

// --- Equipos ---

export const TEAM_STATUSES = ["active", "archived"] as const;
export type TeamStatus = (typeof TEAM_STATUSES)[number];

/** Categoría como texto libre ("Alevín", "Sénior femenino"): cada federación y club la llama a su manera. */
const Category = z.string().trim().max(60);

export const TeamCreateSchema = z.object({
  sectionId: z.string().uuid(),
  seasonId: z.string().uuid(),
  name: ShortName,
  category: Category.optional(),
});
export type TeamCreate = z.infer<typeof TeamCreateSchema>;
export const TeamUpdateSchema = z.object({
  sectionId: z.string().uuid().optional(),
  name: ShortName.optional(),
  category: Category.nullable().optional(),
  status: z.enum(TEAM_STATUSES).optional(),
});
export type TeamUpdate = z.infer<typeof TeamUpdateSchema>;

/** Plantilla: un jugador en un equipo, con dorsal y posición opcionales. */
export const RosterAddSchema = z.object({
  playerId: z.string().uuid(),
  shirtNumber: z.number().int().min(0).max(999).nullable().optional(),
  position: z.string().trim().max(40).nullable().optional(),
});
export type RosterAdd = z.infer<typeof RosterAddSchema>;
export const RosterUpdateSchema = RosterAddSchema.omit({ playerId: true });
export type RosterUpdate = z.infer<typeof RosterUpdateSchema>;

/** Cuerpo técnico del equipo: miembros del club con el rol de entrenador. */
export const StaffAddSchema = z.object({ userId: z.string().uuid() });

// --- Jugadores ---

export const PLAYER_STATUSES = ["active", "inactive"] as const;
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

export const PlayerCreateSchema = z.object({
  firstName: ShortName,
  lastName: z.string().trim().min(1).max(80),
  birthDate: DateOnlySchema.nullable().optional(),
  /** Si viene, el jugador entra en la plantilla de ese equipo al crearse. */
  teamId: z.string().uuid().optional(),
});
export type PlayerCreate = z.infer<typeof PlayerCreateSchema>;
export const PlayerUpdateSchema = z.object({
  firstName: ShortName.optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  birthDate: DateOnlySchema.nullable().optional(),
  status: z.enum(PLAYER_STATUSES).optional(),
});
export type PlayerUpdate = z.infer<typeof PlayerUpdateSchema>;

// --- Familias ---

/** Relación de una persona con un jugador, tal como la recogía el prototipo (docs/dominio.md 1.4). */
export const GUARDIAN_RELATIONSHIPS = [
  "mother",
  "father",
  "guardian",
  "grandparent",
  "other",
] as const;
export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];
export const GuardianRelationshipSchema = z.enum(GUARDIAN_RELATIONSHIPS);

/** Invitar a una familia desde la ficha del jugador: email, relación e idioma del email. */
export const GuardianInviteSchema = z.object({
  email: EmailSchema,
  relationship: GuardianRelationshipSchema,
  locale: LocaleSchema.optional(),
});
export type GuardianInvite = z.infer<typeof GuardianInviteSchema>;

/** Vincular a alguien que ya es miembro del club. */
export const GuardianLinkSchema = z.object({
  userId: z.string().uuid(),
  relationship: GuardianRelationshipSchema,
});
export type GuardianLink = z.infer<typeof GuardianLinkSchema>;

// --- Voz del club (DESIGN.md, sección 11) ---

export const CLUB_VOICES = ["cercana", "profesional", "vestuario"] as const;
export type ClubVoice = (typeof CLUB_VOICES)[number];
export const ClubVoiceSchema = z.enum(CLUB_VOICES);
export const DEFAULT_CLUB_VOICE: ClubVoice = "cercana";

/** Nombre para mostrar de un jugador. Un solo sitio para no concatenar a mano por toda la web. */
export function playerDisplayName(player: { firstName: string; lastName: string }): string {
  return `${player.firstName} ${player.lastName}`.trim();
}

/** Edad en años cumplidos a una fecha, o null sin fecha de nacimiento. */
export function ageOn(birthDate: string | null | undefined, on: Date = new Date()): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  let age = on.getUTCFullYear() - y;
  const beforeBirthday =
    on.getUTCMonth() + 1 < m || (on.getUTCMonth() + 1 === m && on.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}
