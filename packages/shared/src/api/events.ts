import { z } from "zod";
import {
  ATTENDANCE_STATUSES,
  EVENT_KINDS,
  FACILITY_KINDS,
  FACILITY_STATUSES,
  HOME_AWAY,
} from "../events.ts";

/** Contratos de instalaciones y agenda (Bloque 16) y asistencia (Bloque 17). */

export const FacilityHoursSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  opensAt: z.string(),
  closesAt: z.string(),
});

export const FacilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(FACILITY_KINDS),
  capacity: z.number().int().nullable(),
  description: z.string().nullable(),
  status: z.enum(FACILITY_STATUSES),
  sortOrder: z.number().int(),
  hours: z.array(FacilityHoursSchema),
  /** Eventos que la ocupan esta semana. */
  eventsThisWeek: z.number().int().nonnegative(),
});
export type Facility = z.infer<typeof FacilitySchema>;
export const FacilitiesResponseSchema = z.object({ facilities: z.array(FacilitySchema) });
export type FacilitiesResponse = z.infer<typeof FacilitiesResponseSchema>;
export const FacilityResponseSchema = z.object({ facility: FacilitySchema });

/** Un evento tal como lo pinta la agenda: instante de inicio y fin, equipo e instalación si los hay. */
export const EventSummarySchema = z.object({
  id: z.string(),
  kind: z.enum(EVENT_KINDS),
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  section: z.object({ id: z.string(), name: z.string() }).nullable(),
  team: z.object({ id: z.string(), name: z.string() }).nullable(),
  facility: z.object({ id: z.string(), name: z.string() }).nullable(),
  location: z.string().nullable(),
  opponent: z.string().nullable(),
  homeAway: z.enum(HOME_AWAY).nullable(),
  notes: z.string().nullable(),
  seriesId: z.string().nullable(),
  /** Clase abierta (ADR 0049): aforo y quién la da. */
  capacity: z.number().int().nullable(),
  coach: z.object({ userId: z.string(), name: z.string() }).nullable(),
  /** Pase de lista hecho (Bloque 17): presentes sobre convocados, o nulo si no se ha pasado. */
  attendance: z
    .object({ present: z.number().int().nonnegative(), total: z.number().int().nonnegative() })
    .nullable(),
});
export type EventSummary = z.infer<typeof EventSummarySchema>;

export const EventsResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  events: z.array(EventSummarySchema),
  /** Solapes de instalación dentro del rango: dos eventos en la misma instalación a la vez. */
  conflicts: z.array(z.object({ eventId: z.string(), withEventId: z.string() })),
});
export type EventsResponse = z.infer<typeof EventsResponseSchema>;

export const EventResponseSchema = z.object({
  event: EventSummarySchema,
  /** Al crear con repetición semanal: cuántas filas se han generado. */
  created: z.number().int().nonnegative().optional(),
  /** Aviso: la instalación ya tiene otro evento a esa hora. Se guarda igual; el club decide. */
  conflictsWith: z.array(z.object({ eventId: z.string(), title: z.string() })).optional(),
});
export type EventResponse = z.infer<typeof EventResponseSchema>;

/** Pase de lista de un evento: la plantilla del equipo con el estado de cada deportista. */
export const AttendanceEntrySchema = z.object({
  playerId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  photoUrl: z.string().nullable(),
  status: z.enum(ATTENDANCE_STATUSES).nullable(),
  note: z.string().nullable(),
});
export const AttendanceResponseSchema = z.object({
  event: EventSummarySchema,
  entries: z.array(AttendanceEntrySchema),
  access: z.object({ write: z.boolean() }),
});
export type AttendanceResponse = z.infer<typeof AttendanceResponseSchema>;

/** Resumen de asistencia de un deportista o de un equipo en la temporada. */
export const AttendanceSummarySchema = z.object({
  events: z.number().int().nonnegative(),
  present: z.number().int().nonnegative(),
  absent: z.number().int().nonnegative(),
  excused: z.number().int().nonnegative(),
  percent: z.number().int().min(0).max(100).nullable(),
});
export type AttendanceSummary = z.infer<typeof AttendanceSummarySchema>;
