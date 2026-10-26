import { z } from "zod";
import { DateOnlySchema } from "./structure.ts";

/**
 * Instalaciones y agenda (Bloque 16). Una instalación es la piscina, una pista o una sala con
 * sus franjas de apertura; un evento es lo que pasa en el club: entrenamientos, partidos,
 * actividades, reuniones y reservas, con su equipo o grupo y su instalación si la ocupa.
 */

export const FACILITY_KINDS = ["pool", "court", "field", "room", "gym", "other"] as const;
export type FacilityKind = (typeof FACILITY_KINDS)[number];
export const FacilityKindSchema = z.enum(FACILITY_KINDS);
export const FACILITY_STATUSES = ["active", "archived"] as const;
export type FacilityStatus = (typeof FACILITY_STATUSES)[number];

const ShortName = z.string().trim().min(1).max(60);
const Text = z.string().trim().max(400);

export const FacilityCreateSchema = z.object({
  name: ShortName,
  kind: FacilityKindSchema,
  capacity: z.number().int().min(1).max(100_000).nullable().optional(),
  description: Text.nullable().optional(),
});
export type FacilityCreate = z.infer<typeof FacilityCreateSchema>;
export const FacilityUpdateSchema = z.object({
  name: ShortName.optional(),
  kind: FacilityKindSchema.optional(),
  capacity: z.number().int().min(1).max(100_000).nullable().optional(),
  description: Text.nullable().optional(),
  status: z.enum(FACILITY_STATUSES).optional(),
});
export type FacilityUpdate = z.infer<typeof FacilityUpdateSchema>;

/** Hora del día sin zona, `HH:MM`. */
export const TimeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida: usa el formato HH:MM.");
/** Día de la semana ISO: 1 lunes … 7 domingo. */
export const WeekdaySchema = z.number().int().min(1).max(7);
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

const Slot = z
  .object({ weekday: WeekdaySchema, opensAt: TimeOfDaySchema, closesAt: TimeOfDaySchema })
  .refine((s) => s.opensAt < s.closesAt, {
    message: "La franja tiene que cerrar después de abrir.",
    path: ["closesAt"],
  });
/** Franjas de apertura de una instalación: sustituyen a las anteriores. */
export const FacilityHoursSetSchema = z.object({ hours: z.array(Slot).max(50) });
export type FacilityHoursSet = z.infer<typeof FacilityHoursSetSchema>;

// --- Agenda ---

export const EVENT_KINDS = [
  "training",
  "match",
  "activity",
  "meeting",
  "booking",
  "other",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const EventKindSchema = z.enum(EVENT_KINDS);
export const HOME_AWAY = ["home", "away"] as const;
export type HomeAway = (typeof HOME_AWAY)[number];

/** Instante con zona (ISO 8601). La agenda guarda instantes; la web los pinta en la zona del club. */
export const DateTimeSchema = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "Fecha y hora inválidas.",
});

export const EventCreateSchema = z
  .object({
    kind: EventKindSchema,
    title: z.string().trim().min(1).max(120),
    sectionId: z.string().uuid().nullable().optional(),
    teamId: z.string().uuid().nullable().optional(),
    facilityId: z.string().uuid().nullable().optional(),
    startsAt: DateTimeSchema,
    endsAt: DateTimeSchema,
    location: Text.nullable().optional(),
    opponent: ShortName.nullable().optional(),
    homeAway: z.enum(HOME_AWAY).nullable().optional(),
    notes: Text.nullable().optional(),
    /** Clase abierta (ADR 0049): aforo propio y quién la da. */
    capacity: z.number().int().min(1).max(999).nullable().optional(),
    coachUserId: z.string().uuid().nullable().optional(),
    /** Repite cada semana hasta esta fecha incluida: genera una fila por semana (sin motor de recurrencia). */
    repeatWeeklyUntil: DateOnlySchema.nullable().optional(),
  })
  .refine((e) => Date.parse(e.startsAt) < Date.parse(e.endsAt), {
    message: "El evento tiene que acabar después de empezar.",
    path: ["endsAt"],
  });
export type EventCreate = z.infer<typeof EventCreateSchema>;

export const EventUpdateSchema = z.object({
  kind: EventKindSchema.optional(),
  title: z.string().trim().min(1).max(120).optional(),
  sectionId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  facilityId: z.string().uuid().nullable().optional(),
  startsAt: DateTimeSchema.optional(),
  endsAt: DateTimeSchema.optional(),
  location: Text.nullable().optional(),
  opponent: ShortName.nullable().optional(),
  homeAway: z.enum(HOME_AWAY).nullable().optional(),
  notes: Text.nullable().optional(),
  capacity: z.number().int().min(1).max(999).nullable().optional(),
  coachUserId: z.string().uuid().nullable().optional(),
});
export type EventUpdate = z.infer<typeof EventUpdateSchema>;

/** Horario semanal de un equipo o grupo: de aquí salen los entrenamientos de la temporada. */
export const TeamScheduleSlotSchema = z
  .object({
    weekday: WeekdaySchema,
    startsAt: TimeOfDaySchema,
    endsAt: TimeOfDaySchema,
    facilityId: z.string().uuid().nullable().optional(),
    /** Clase abierta (ADR 0049): quién la da y su aforo, si no es el del tipo de clase. */
    coachUserId: z.string().uuid().nullable().optional(),
    capacity: z.number().int().min(1).max(999).nullable().optional(),
  })
  .refine((s) => s.startsAt < s.endsAt, {
    message: "La sesión tiene que acabar después de empezar.",
    path: ["endsAt"],
  });
export type TeamScheduleSlot = z.infer<typeof TeamScheduleSlotSchema>;
export const TeamScheduleSetSchema = z.object({
  slots: z.array(TeamScheduleSlotSchema).max(14),
  /** Si viene, genera (o regenera) los entrenamientos de la temporada a partir de hoy. */
  generate: z.boolean().optional(),
});
export type TeamScheduleSet = z.infer<typeof TeamScheduleSetSchema>;

// --- Asistencia (Bloque 17) ---

export const ATTENDANCE_STATUSES = ["present", "absent", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export const AttendanceStatusSchema = z.enum(ATTENDANCE_STATUSES);

export const AttendanceSetSchema = z.object({
  entries: z
    .array(
      z.object({
        playerId: z.string().uuid(),
        status: AttendanceStatusSchema,
        note: z.string().trim().max(120).nullable().optional(),
      }),
    )
    .max(200),
});
export type AttendanceSet = z.infer<typeof AttendanceSetSchema>;

/** Hora de inicio ISO de un `HH:MM` en un día, en la zona del club. Pensado para la agenda generada. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
