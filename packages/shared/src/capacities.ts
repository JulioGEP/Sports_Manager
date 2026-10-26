import { z } from "zod";

/**
 * Vocabulario básico de la planificación del box (ADR 0052) que comparten el WOD y el plan: las
 * capacidades que se entrenan, los dominios de tiempo, el papel de cada día y las pistas de volumen.
 * Va aparte para que el WOD (`fitness.ts`) y el plan (`planning.ts`) lo usen sin depender uno del otro.
 */

/** Lo que se entrena. El plan reparte 100 puntos entre ellas. */
export const CAPACITIES = [
  "strength",
  "weightlifting",
  "gymnastics",
  "engine",
  "intensity",
  "mobility",
] as const;
export type Capacity = (typeof CAPACITIES)[number];
export const CapacitySchema = z.enum(CAPACITIES);

/** Cuánto dura el WOD: corto, medio, largo o muy largo. */
export const TIME_DOMAINS = ["short", "medium", "long", "very_long"] as const;
export type TimeDomain = (typeof TIME_DOMAINS)[number];
export const TimeDomainSchema = z.enum(TIME_DOMAINS);

/** El papel de un día dentro de la semana del plan. */
export const DAY_ROLES = [
  "heavy_lower",
  "gymnastics_engine",
  "olympic_metcon",
  "long_engine",
  "upper_intervals",
  "team",
  "skill_mobility",
  "test",
  "benchmark",
  "open_sim",
  "hyrox_stations",
  "hyrox_strength",
  "hyrox_sim",
  "oly_technique",
  "oly_strength",
] as const;
export type DayRole = (typeof DAY_ROLES)[number];
export const DayRoleSchema = z.enum(DAY_ROLES);

/**
 * Pista de un bloque del WOD: la clase o Clase+, el trabajo extra para el Open Box que se vende
 * como complemento de la tarifa (el mismo esqueleto con más volumen).
 */
export const WORKOUT_TRACKS = ["class", "plus"] as const;
export type WorkoutTrack = (typeof WORKOUT_TRACKS)[number];
export const WorkoutTrackSchema = z.enum(WORKOUT_TRACKS);
