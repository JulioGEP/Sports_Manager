import {
  AiPlanGenerationResponseSchema,
  EquipmentResponseSchema,
  MyCycleResponseSchema,
  MyCycleSummaryResponseSchema,
  PlanHealthResponseSchema,
  PlanningContextResponseSchema,
  PlanningSettingsResponseSchema,
  PlanResponseSchema,
  PlanReviewResponseSchema,
  PlansResponseSchema,
  PlanWeekResponseSchema,
  type WorkoutLevel,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiFetch } from "./api";
import { useReadyClub } from "./club";
import { fitnessKey } from "./fitness";
import { useT } from "./intl";

/**
 * Planificación del box (ADR 0052): las consultas de las pantallas del plan, del material y del
 * ciclo del atleta. Cuelgan de `["org", slug, "fitness", "planning", ...]`, así que cualquier
 * cambio de fitness las refresca con el resto.
 */

const key = (slug: string, ...rest: (string | number | null | undefined)[]) =>
  fitnessKey(slug, "planning", ...rest);

export function usePlanningContext(section: string | null, enabled = true) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: key(slug, "context", section),
    queryFn: () =>
      apiFetch(`/api/org/planning/context${section ? `?section=${section}` : ""}`, {
        schema: PlanningContextResponseSchema,
      }),
    enabled,
    retry: false,
  });
}

export function usePlans(enabled = true) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: key(slug, "plans"),
    queryFn: () => apiFetch("/api/org/plans", { schema: PlansResponseSchema }),
    enabled,
  });
}

export function usePlan(id: string | undefined) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: key(slug, "plan", id),
    queryFn: () => apiFetch(`/api/org/plans/${id}`, { schema: PlanResponseSchema }),
    enabled: Boolean(id),
    retry: false,
  });
}

export function usePlanWeek(id: string | undefined, n: number | null) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: key(slug, "week", id, n),
    queryFn: () => apiFetch(`/api/org/plans/${id}/weeks/${n}`, { schema: PlanWeekResponseSchema }),
    enabled: Boolean(id) && n !== null,
    retry: false,
  });
}

export function usePlanReview(id: string | undefined, week: number | null) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: key(slug, "review", id, week),
    queryFn: () =>
      apiFetch(`/api/org/plans/${id}/review${week ? `?week=${week}` : ""}`, {
        schema: PlanReviewResponseSchema,
      }),
    enabled: Boolean(id),
    retry: false,
  });
}

export function usePlanHealth(id: string | undefined) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: key(slug, "health", id),
    queryFn: () => apiFetch(`/api/org/plans/${id}/health`, { schema: PlanHealthResponseSchema }),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useEquipment(enabled = true) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: key(slug, "equipment"),
    queryFn: () => apiFetch("/api/org/equipment", { schema: EquipmentResponseSchema }),
    enabled,
  });
}

export function usePlanningSettings(enabled = true) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: key(slug, "settings"),
    queryFn: () =>
      apiFetch("/api/org/planning/settings", { schema: PlanningSettingsResponseSchema }),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Una propuesta de la IA del plan: se consulta cada pocos segundos hasta que está lista. */
export function useAiPlanGeneration(id: string | null) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: key(slug, "ai", id),
    queryFn: () => apiFetch(`/api/org/plan-ai/${id}`, { schema: AiPlanGenerationResponseSchema }),
    enabled: id !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.generation.status;
      return status === "ready" || status === "failed" ? false : 2500;
    },
  });
}

export function useMyCycle(enabled = true) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: key(slug, "my-cycle"),
    queryFn: () => apiFetch("/api/org/me/cycle", { schema: MyCycleResponseSchema }),
    enabled,
    retry: false,
  });
}

export function useMyCycleSummary(plan: string | null) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: key(slug, "my-cycle-summary", plan),
    queryFn: () =>
      apiFetch(`/api/org/me/cycle/summary${plan ? `?plan=${plan}` : ""}`, {
        schema: MyCycleSummaryResponseSchema,
      }),
    retry: false,
  });
}

/**
 * El nombre de un nivel: el que le ha puesto el box (Base, Intermedio…) o el de siempre
 * (Iniciación, Scaled, RX, RX+).
 */
export function useLevelName() {
  const levels = useT("fitness.common.levels");
  const settings = usePlanningSettings();
  const names = settings.data?.settings.levelNames;
  return useCallback(
    (level: WorkoutLevel) => names?.[level]?.trim() || levels(level),
    [names, levels],
  );
}
