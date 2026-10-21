import { z } from "zod";
import { LocaleSchema } from "./locales.ts";
import { SectionKindSchema } from "./sports.ts";
import { EmailSchema } from "./users.ts";

/**
 * Estructura del club (Fase 1, Bloque 11, ADR 0028; Bloque 14): temporadas, secciones con su
 * deporte, categorías, equipos o grupos con su plantilla por temporada, jugadores y sus familias.
 * Los catálogos de estados y relaciones son listas en código que la base convierte en
 * restricciones CHECK (docs/modelo-datos.md).
 */

/** Fecha de calendario sin hora, `AAAA-MM-DD`. Las fechas de nacimiento y de temporada no llevan zona. */
export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida: usa el formato AAAA-MM-DD.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Fecha inválida.");

const ShortName = z.string().trim().min(1).max(60);
const Description = z.string().trim().max(400);

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

/** Una sección tiene deporte (Bloque 14), tipo (competición o actividad) y, si quiere, coordinación. */
export const SectionCreateSchema = z.object({
  name: ShortName,
  sportCode: z.string().trim().min(1).max(40),
  kind: SectionKindSchema.optional(),
  coordinatorUserId: z.string().uuid().nullable().optional(),
  description: Description.nullable().optional(),
  /** Categorías que se crean con la sección (las sugeridas por el deporte que el club marque). */
  categories: z
    .array(
      z.object({
        name: ShortName,
        gender: z.enum(["male", "female", "mixed"]).nullable().optional(),
        birthYearFrom: z.number().int().min(1900).max(2100).nullable().optional(),
        birthYearTo: z.number().int().min(1900).max(2100).nullable().optional(),
      }),
    )
    .max(30)
    .optional(),
});
export type SectionCreate = z.infer<typeof SectionCreateSchema>;
export const SectionUpdateSchema = z.object({
  name: ShortName.optional(),
  status: z.enum(SECTION_STATUSES).optional(),
  sportCode: z.string().trim().min(1).max(40).optional(),
  kind: SectionKindSchema.optional(),
  coordinatorUserId: z.string().uuid().nullable().optional(),
  description: Description.nullable().optional(),
});
export type SectionUpdate = z.infer<typeof SectionUpdateSchema>;

// --- Categorías ---

export const CATEGORY_GENDERS = ["male", "female", "mixed"] as const;
export type CategoryGender = (typeof CATEGORY_GENDERS)[number];
export const CategoryGenderSchema = z.enum(CATEGORY_GENDERS);
export const CATEGORY_STATUSES = ["active", "archived"] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

const BirthYear = z.number().int().min(1900).max(2100);

/** Categoría de una sección: "Sénior masculino", "Alevín", "Adultos". Entre la sección y el equipo. */
export const CategoryCreateSchema = z
  .object({
    sectionId: z.string().uuid(),
    name: ShortName,
    gender: CategoryGenderSchema.nullable().optional(),
    birthYearFrom: BirthYear.nullable().optional(),
    birthYearTo: BirthYear.nullable().optional(),
  })
  .refine((c) => !c.birthYearFrom || !c.birthYearTo || c.birthYearFrom <= c.birthYearTo, {
    message: "El año inicial no puede ser mayor que el final.",
    path: ["birthYearTo"],
  });
export type CategoryCreate = z.infer<typeof CategoryCreateSchema>;
export const CategoryUpdateSchema = z.object({
  name: ShortName.optional(),
  gender: CategoryGenderSchema.nullable().optional(),
  birthYearFrom: BirthYear.nullable().optional(),
  birthYearTo: BirthYear.nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  status: z.enum(CATEGORY_STATUSES).optional(),
});
export type CategoryUpdate = z.infer<typeof CategoryUpdateSchema>;

// --- Equipos ---

export const TEAM_STATUSES = ["active", "archived"] as const;
export type TeamStatus = (typeof TEAM_STATUSES)[number];

/** Un equipo (o grupo, en una sección de actividad) vive en una sección, una categoría y una temporada. */
export const TeamCreateSchema = z.object({
  sectionId: z.string().uuid(),
  seasonId: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: ShortName,
  /** Aforo del grupo (secciones de actividad). Sin aforo, no hay límite. */
  capacity: z.number().int().min(1).max(999).nullable().optional(),
});
export type TeamCreate = z.infer<typeof TeamCreateSchema>;
export const TeamUpdateSchema = z.object({
  sectionId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  name: ShortName.optional(),
  capacity: z.number().int().min(1).max(999).nullable().optional(),
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

/** Papel de cada persona en el cuerpo técnico de un equipo (Bloque 14). */
export const TEAM_STAFF_ROLES = ["head_coach", "assistant", "delegate", "physio", "other"] as const;
export type TeamStaffRole = (typeof TEAM_STAFF_ROLES)[number];
export const TeamStaffRoleSchema = z.enum(TEAM_STAFF_ROLES);

/** Cuerpo técnico del equipo: miembros del club con el rol de entrenador o personal. */
export const StaffAddSchema = z.object({
  userId: z.string().uuid(),
  roleInTeam: TeamStaffRoleSchema.optional(),
});
export type StaffAdd = z.infer<typeof StaffAddSchema>;

// --- Jugadores (deportistas) ---

export const PLAYER_STATUSES = ["active", "inactive"] as const;
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

/** Género de una persona (Bloque 14). Opcional siempre. */
export const PERSON_GENDERS = ["female", "male", "other"] as const;
export type PersonGender = (typeof PERSON_GENDERS)[number];
export const PersonGenderSchema = z.enum(PERSON_GENDERS);

const Phone = z.string().trim().max(30);
const NationalId = z.string().trim().max(20);

/**
 * Alta de un deportista. Crea la persona si no se indica una existente (Bloque 14: un socio
 * adulto que empieza a entrenar ya es una persona del club).
 */
export const PlayerCreateSchema = z
  .object({
    /** Persona que ya existe en el club (un socio, por ejemplo). Con ella, no se crea otra. */
    personId: z.string().uuid().optional(),
    firstName: ShortName.optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    birthDate: DateOnlySchema.nullable().optional(),
    gender: PersonGenderSchema.nullable().optional(),
    email: EmailSchema.nullable().optional(),
    phone: Phone.nullable().optional(),
    /** Fecha de alta en el club (Bloque 13). Sin ella, cuenta desde que se creó la ficha. */
    joinedOn: DateOnlySchema.nullable().optional(),
    /** Si viene, el jugador entra en la plantilla de ese equipo al crearse. */
    teamId: z.string().uuid().optional(),
  })
  .refine((p) => p.personId || (p.firstName && p.lastName), {
    message: "Hace falta una persona existente o nombre y apellidos.",
    path: ["firstName"],
  });
export type PlayerCreate = z.infer<typeof PlayerCreateSchema>;
/** Pie dominante (Bloque 12, ADR 0029). Dato deportivo de la ficha; opcional. */
export const DOMINANT_FEET = ["right", "left", "both"] as const;
export type DominantFoot = (typeof DOMINANT_FEET)[number];
export const DominantFootSchema = z.enum(DOMINANT_FEET);

/** Altura en centímetros. Límites amplios: solo descartan errores de tecleo. */
export const PLAYER_HEIGHT_MIN_CM = 50;
export const PLAYER_HEIGHT_MAX_CM = 250;
export const PlayerHeightSchema = z
  .number()
  .int()
  .min(PLAYER_HEIGHT_MIN_CM)
  .max(PLAYER_HEIGHT_MAX_CM);

export const PlayerUpdateSchema = z.object({
  firstName: ShortName.optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  birthDate: DateOnlySchema.nullable().optional(),
  gender: PersonGenderSchema.nullable().optional(),
  email: EmailSchema.nullable().optional(),
  phone: Phone.nullable().optional(),
  nationalId: NationalId.nullable().optional(),
  joinedOn: DateOnlySchema.nullable().optional(),
  status: z.enum(PLAYER_STATUSES).optional(),
  dominantFoot: DominantFootSchema.nullable().optional(),
  heightCm: PlayerHeightSchema.nullable().optional(),
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
