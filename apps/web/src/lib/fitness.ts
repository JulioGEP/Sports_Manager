import {
  AnnouncementsResponseSchema,
  BoxDashboardResponseSchema,
  ClassDetailResponseSchema,
  ClassesResponseSchema,
  ClassTypesResponseSchema,
  FitnessAthleteDetailResponseSchema,
  FitnessAthletesResponseSchema,
  FitnessHomeResponseSchema,
  FitnessMetricsResponseSchema,
  LeaderboardResponseSchema,
  LeadsResponseSchema,
  MessageThreadResponseSchema,
  MessageThreadsResponseSchema,
  MyBookingsResponseSchema,
  MyWorkoutsResponseSchema,
  MyPlanResponseSchema,
  ProgressResponseSchema,
  SubscriptionsResponseSchema,
  WorkoutResponseSchema,
  WorkoutsResponseSchema,
  addDays,
  type BoxDashboard,
  type BoxWidget,
  type ClubModel,
  type WorkoutLevel,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useIntl } from "react-intl";
import { apiFetch } from "./api";
import { useClub, useReadyClub } from "./club";

/**
 * Clubs de fitness (ADR 0049): las consultas y los formatos que comparten las pantallas del atleta,
 * del coach y del dueño. Las claves cuelgan de `["org", slug, "fitness", ...]`: "ver como" las
 * vacía con el resto del club.
 */

/** Modelo del club: `sports` (los clubs deportivos de siempre) o `fitness` (boxes y gimnasios). */
export function useClubModel(): ClubModel {
  const { look } = useClub();
  return look?.clubModel ?? "sports";
}

export const isFitness = (model: ClubModel) => model === "fitness";

/**
 * Con qué ojos mira el box quien entra: el dueño (administra), el coach (personal que ve las
 * clases), el atleta (su propia ficha) o la familia de un atleta menor.
 */
export type FitnessRole = "owner" | "coach" | "athlete" | "guardian";

export function useFitnessRole(): FitnessRole {
  const { org } = useReadyClub();
  const actor = org.actor;
  const has = (p: string) => actor.permissions.includes(p as (typeof actor.permissions)[number]);
  if (actor.kind !== "member") return "owner";
  if (actor.roles.includes("org_admin")) return "owner";
  if (has("org.events.read")) return "coach";
  if (actor.athletePlayerId) return "athlete";
  return "guardian";
}

/** Zona del club: la de la organización si se ve entera; si no, la del navegador. */
export function useClubTimezone(): string | undefined {
  const { org } = useReadyClub();
  return org.organization.view === "full" ? org.organization.timezone : undefined;
}

/** Hoy en la zona del club, `AAAA-MM-DD`. */
export function todayInClub(timezone: string | undefined, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(now);
}

export const fitnessKey = (slug: string, ...rest: (string | number | null | undefined)[]) =>
  ["org", slug, "fitness", ...rest] as const;

/** Tras cualquier cambio (reservar, cancelar, check-in, resultado…), todo lo de fitness al día. */
export function invalidateFitness(client: QueryClient, slug: string) {
  return client.invalidateQueries({ queryKey: ["org", slug, "fitness"] });
}

export function useInvalidateFitness() {
  const client = useQueryClient();
  const { slug } = useReadyClub();
  return useCallback(() => invalidateFitness(client, slug), [client, slug]);
}

/** Instantes ISO del principio de un día local y de `days` días después (para `/classes`). */
export function dayRange(timezone: string | undefined, date: string, days = 1) {
  const startOf = (d: string) => {
    // Medianoche local: el desfase de la zona ese día, calculado con Intl.
    const probe = new Date(`${d}T12:00:00Z`);
    const local = new Date(
      probe.toLocaleString("en-US", { timeZone: timezone ?? "UTC", hour12: false }),
    );
    const utc = new Date(probe.toLocaleString("en-US", { timeZone: "UTC", hour12: false }));
    const offset = local.getTime() - utc.getTime();
    return new Date(Date.parse(`${d}T00:00:00Z`) - offset);
  };
  return { from: startOf(date).toISOString(), to: startOf(addDays(date, days)).toISOString() };
}

// --- Consultas del atleta ---

export function useMyFitness(enabled = true) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "me"),
    queryFn: () => apiFetch("/api/org/me/fitness", { schema: FitnessHomeResponseSchema }),
    enabled,
    retry: false,
  });
}

export function useClasses(
  range: { from: string; to: string },
  filter: { section?: string | undefined; team?: string | undefined; mine?: boolean } = {},
  enabled = true,
) {
  const { slug } = useReadyClub();
  const params = new URLSearchParams({ from: range.from, to: range.to });
  if (filter.section) params.set("section", filter.section);
  if (filter.team) params.set("team", filter.team);
  if (filter.mine) params.set("mine", "1");
  return useQuery({
    queryKey: fitnessKey(slug, "classes", params.toString()),
    queryFn: () => apiFetch(`/api/org/classes?${params}`, { schema: ClassesResponseSchema }),
    enabled,
  });
}

export function useClassDetail(id: string | undefined) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "class", id),
    queryFn: () => apiFetch(`/api/org/classes/${id}`, { schema: ClassDetailResponseSchema }),
    enabled: Boolean(id),
  });
}

export function useMyBookings() {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "my-bookings"),
    queryFn: () => apiFetch("/api/org/me/bookings", { schema: MyBookingsResponseSchema }),
  });
}

export function useMyPlan() {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "my-plan"),
    queryFn: () => apiFetch("/api/org/me/plan", { schema: MyPlanResponseSchema }),
  });
}

export function useMyWorkouts(date: string) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "my-workouts", date),
    queryFn: () =>
      apiFetch(`/api/org/me/workouts?date=${date}`, { schema: MyWorkoutsResponseSchema }),
  });
}

export function useLeaderboard(
  blockId: string | undefined,
  filter: {
    level?: WorkoutLevel | undefined;
    classId?: string | undefined;
    /** Como la ve un atleta, sin quien no quiere salir (la pantalla del box). */
    publicView?: boolean | undefined;
  } = {},
) {
  const { slug } = useReadyClub();
  const params = new URLSearchParams();
  if (filter.level) params.set("level", filter.level);
  if (filter.classId) params.set("class", filter.classId);
  if (filter.publicView) params.set("public", "1");
  const qs = params.toString();
  return useQuery({
    queryKey: fitnessKey(slug, "leaderboard", blockId, qs),
    queryFn: () =>
      apiFetch(`/api/org/workouts/blocks/${blockId}/leaderboard${qs ? `?${qs}` : ""}`, {
        schema: LeaderboardResponseSchema,
      }),
    enabled: Boolean(blockId),
  });
}

export function useProgress(month?: string) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "progress", month ?? "current"),
    queryFn: () =>
      apiFetch(`/api/org/me/progress${month ? `?month=${month}` : ""}`, {
        schema: ProgressResponseSchema,
      }),
  });
}

export function useAnnouncements() {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "announcements"),
    queryFn: () => apiFetch("/api/org/announcements", { schema: AnnouncementsResponseSchema }),
  });
}

export function useMyMessages(enabled = true) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "my-messages"),
    queryFn: () => apiFetch("/api/org/me/messages", { schema: MessageThreadResponseSchema }),
    enabled,
  });
}

export function useMessageThreads(enabled = true) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "threads"),
    queryFn: () => apiFetch("/api/org/messages", { schema: MessageThreadsResponseSchema }),
    enabled,
  });
}

export function useMessageThread(playerId: string | undefined) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "thread", playerId),
    queryFn: () =>
      apiFetch(`/api/org/messages/${playerId}`, { schema: MessageThreadResponseSchema }),
    enabled: Boolean(playerId),
  });
}

// --- Consultas del personal ---

export function useWorkouts(range: { from: string; to: string; section?: string | undefined }) {
  const { slug } = useReadyClub();
  const params = new URLSearchParams({ from: range.from, to: range.to });
  if (range.section) params.set("section", range.section);
  return useQuery({
    queryKey: fitnessKey(slug, "workouts", params.toString()),
    queryFn: () => apiFetch(`/api/org/workouts?${params}`, { schema: WorkoutsResponseSchema }),
  });
}

export function useWorkout(id: string | undefined) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "workout", id),
    queryFn: () => apiFetch(`/api/org/workouts/${id}`, { schema: WorkoutResponseSchema }),
    enabled: Boolean(id),
  });
}

export function useAthletes(enabled = true) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "athletes"),
    queryFn: () => apiFetch("/api/org/athletes", { schema: FitnessAthletesResponseSchema }),
    enabled,
  });
}

export function useAthleteDetail(id: string | undefined) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "athlete", id),
    queryFn: () =>
      apiFetch(`/api/org/athletes/${id}`, { schema: FitnessAthleteDetailResponseSchema }),
    enabled: Boolean(id),
  });
}

export function useClassTypes(enabled = true) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "class-types"),
    queryFn: () => apiFetch("/api/org/class-types", { schema: ClassTypesResponseSchema }),
    enabled,
  });
}

export function useSubscriptions(enabled = true) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "subscriptions"),
    queryFn: () => apiFetch("/api/org/subscriptions", { schema: SubscriptionsResponseSchema }),
    enabled,
  });
}

export function useLeads(enabled = true) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "leads"),
    queryFn: () => apiFetch("/api/org/leads", { schema: LeadsResponseSchema }),
    enabled,
  });
}

export function useFitnessMetrics(enabled = true) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "metrics"),
    queryFn: () => apiFetch("/api/org/fitness/metrics", { schema: FitnessMetricsResponseSchema }),
    enabled,
  });
}

/**
 * Un cuadro de mando del box (ADR 0055): Hoy o la portada de un área, con los KPIs que ha elegido
 * el club. Con `preview`, las cifras de todos los que se pueden elegir (para el selector).
 */
export function useDashboard(
  dashboard: BoxDashboard,
  options: { preview?: boolean; enabled?: boolean } = {},
) {
  const { slug } = useReadyClub();
  const preview = options.preview ?? false;
  return useQuery({
    queryKey: fitnessKey(slug, "dashboard", dashboard, preview ? "all" : "chosen"),
    queryFn: () =>
      apiFetch(`/api/org/dashboards/${dashboard}${preview ? "?preview=all" : ""}`, {
        schema: BoxDashboardResponseSchema,
      }),
    enabled: options.enabled ?? true,
  });
}

/** Guarda las piezas de un cuadro para todo el club (nulo: las de serie) y refresca los cuadros. */
export function useSaveDashboard(dashboard: BoxDashboard) {
  const client = useQueryClient();
  const { slug } = useReadyClub();
  return useCallback(
    async (widgets: BoxWidget[] | null) => {
      const saved = await apiFetch(`/api/org/dashboards/${dashboard}`, {
        method: "PUT",
        body: { widgets },
        schema: BoxDashboardResponseSchema,
      });
      await client.invalidateQueries({ queryKey: fitnessKey(slug, "dashboard") });
      return saved;
    },
    [client, slug, dashboard],
  );
}

// --- Formatos ---

/** Horas, días y "hoy/mañana" en la zona del club. */
export function useClassTime() {
  const intl = useIntl();
  const timezone = useClubTimezone();
  const tz = timezone ? { timeZone: timezone } : {};
  return {
    timezone,
    hour: (iso: string) =>
      intl.formatTime(new Date(iso), { hour: "2-digit", minute: "2-digit", ...tz }),
    range: (from: string, to: string) =>
      `${intl.formatTime(new Date(from), { hour: "2-digit", minute: "2-digit", ...tz })}–${intl.formatTime(new Date(to), { hour: "2-digit", minute: "2-digit", ...tz })}`,
    /** Día de calendario (`AAAA-MM-DD`): "lunes 3". */
    weekday: (date: string, style: "short" | "long" = "long") =>
      intl.formatDate(new Date(`${date}T12:00:00Z`), {
        weekday: style,
        day: "numeric",
        timeZone: "UTC",
      }),
    /** Día de calendario largo: "lunes, 3 de noviembre". */
    day: (date: string) =>
      intl.formatDate(new Date(`${date}T12:00:00Z`), {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }),
    /** Instante con día y hora. */
    when: (iso: string) =>
      `${intl.formatDate(new Date(iso), { weekday: "short", day: "numeric", month: "short", ...tz })} · ${intl.formatTime(new Date(iso), { hour: "2-digit", minute: "2-digit", ...tz })}`,
    today: todayInClub(timezone),
  };
}

/** Los `n` días de calendario desde `from`. */
export function daysFrom(from: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(from, i));
}

/** Kilos con un decimal como mucho y sin ceros de más: 62,5 kg. */
export function useKg() {
  const intl = useIntl();
  return (kg: number) => `${intl.formatNumber(kg, { maximumFractionDigits: 1 })} kg`;
}
