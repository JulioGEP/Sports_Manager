import {
  CategoriesResponseSchema,
  ActivityResponseSchema,
  ClubMembersResponseSchema,
  EventsResponseSchema,
  FacilitiesResponseSchema,
  FamilyResponseSchema,
  FeeChargesResponseSchema,
  InvitationsResponseSchema,
  MembersResponseSchema,
  MemberTypesResponseSchema,
  MyFeesResponseSchema,
  PaymentsSettingsResponseSchema,
  PlayersResponseSchema,
  SeasonsResponseSchema,
  SectionsResponseSchema,
  SportCatalogResponseSchema,
  StoreOrdersResponseSchema,
  StructureSummarySchema,
  TeamsResponseSchema,
  type FeeChargeStatus,
  type StoreOrderStatus,
} from "@sportsmanager/shared";
import { queryOptions } from "@tanstack/react-query";
import { addDays, weekStart } from "./agenda";
import { apiFetch } from "./api";

/**
 * Las listas del club que usan varias pantallas, con una sola clave cada una (ADR 0060). Antes cada
 * pantalla ponía la suya (`teams`, `teams,null`, `teams,training`…) y la misma lista se volvía a
 * descargar al cambiar de pantalla; con una clave, lo que trajo una pantalla lo pinta la siguiente
 * al momento, y la precarga de los enlaces puede dejarlo listo antes del clic.
 *
 * Todas cuelgan de `["org", slug, …]`: "ver como" y los cambios las vacían como siempre.
 */
export const orgQueries = {
  summary: (slug: string) =>
    queryOptions({
      queryKey: ["org", slug, "summary"],
      queryFn: () => apiFetch("/api/org/summary", { schema: StructureSummarySchema }),
    }),
  teams: (slug: string) =>
    queryOptions({
      queryKey: ["org", slug, "teams"],
      queryFn: () => apiFetch("/api/org/teams", { schema: TeamsResponseSchema }),
    }),
  sections: (slug: string) =>
    queryOptions({
      queryKey: ["org", slug, "sections", null],
      queryFn: () => apiFetch("/api/org/sections", { schema: SectionsResponseSchema }),
    }),
  players: (slug: string) =>
    queryOptions({
      queryKey: ["org", slug, "players", "all"],
      queryFn: () => apiFetch("/api/org/players", { schema: PlayersResponseSchema }),
    }),
  members: (slug: string) =>
    queryOptions({
      queryKey: ["org", slug, "members"],
      queryFn: () => apiFetch("/api/org/members", { schema: MembersResponseSchema }),
    }),
  clubMembers: (slug: string) =>
    queryOptions({
      queryKey: ["org", slug, "club-members", "all", "all"],
      queryFn: () => apiFetch("/api/org/club-members", { schema: ClubMembersResponseSchema }),
    }),
  facilities: (slug: string) =>
    queryOptions({
      queryKey: ["org", slug, "facilities"],
      queryFn: () => apiFetch("/api/org/facilities", { schema: FacilitiesResponseSchema }),
    }),
  family: (slug: string) =>
    queryOptions({
      queryKey: ["org", slug, "family"],
      queryFn: () => apiFetch("/api/org/family", { schema: FamilyResponseSchema }),
    }),
  seasons: (slug: string) =>
    queryOptions({
      queryKey: ["org", slug, "seasons"],
      queryFn: () => apiFetch("/api/org/seasons", { schema: SeasonsResponseSchema }),
    }),
  sports: (slug: string) =>
    queryOptions({
      queryKey: ["org", slug, "sports"],
      queryFn: () => apiFetch("/api/org/sports", { schema: SportCatalogResponseSchema }),
    }),
  memberTypes: (slug: string) =>
    queryOptions({
      queryKey: ["org", slug, "member-types"],
      queryFn: () => apiFetch("/api/org/member-types", { schema: MemberTypesResponseSchema }),
    }),
  categories: (slug: string, section: string | null = null) =>
    queryOptions({
      queryKey: ["org", slug, "categories", section ?? "all"],
      queryFn: () =>
        apiFetch(`/api/org/categories${section ? `?section=${section}` : ""}`, {
          schema: CategoriesResponseSchema,
        }),
    }),
  feeCharges: (slug: string, status: FeeChargeStatus | null) =>
    queryOptions({
      queryKey: ["org", slug, "fees", "charges", status],
      queryFn: () =>
        apiFetch(`/api/org/fees/charges${status ? `?status=${status}` : ""}`, {
          schema: FeeChargesResponseSchema,
        }),
    }),
  feesSettings: (slug: string) =>
    queryOptions({
      queryKey: ["org", slug, "fees", "settings"],
      queryFn: () => apiFetch("/api/org/fees/settings", { schema: PaymentsSettingsResponseSchema }),
    }),
  activity: (slug: string, limit: number) =>
    queryOptions({
      queryKey: ["org", slug, "activity", limit],
      queryFn: () =>
        apiFetch(`/api/org/activity?limit=${limit}`, { schema: ActivityResponseSchema }),
    }),
  myFees: (slug: string) =>
    queryOptions({
      queryKey: ["org", slug, "fees", "mine"],
      queryFn: () => apiFetch("/api/org/fees/mine", { schema: MyFeesResponseSchema }),
    }),
  storeOrders: (slug: string, status: StoreOrderStatus | null) =>
    queryOptions({
      queryKey: ["org", slug, "store", "orders", status],
      queryFn: () =>
        apiFetch(`/api/org/store/orders${status ? `?status=${status}` : ""}`, {
          schema: StoreOrdersResponseSchema,
        }),
    }),
  /** La agenda con sus filtros (`from`, `to` y lo que se filtre): del club, o de la familia. */
  agenda: (slug: string, family: boolean, query: string) =>
    queryOptions({
      queryKey: ["agenda", slug, family ? "family" : "club", query],
      queryFn: () =>
        apiFetch(`${family ? "/api/org/family/agenda" : "/api/org/events"}?${query}`, {
          schema: EventsResponseSchema,
        }),
    }),
  invitations: (slug: string) =>
    queryOptions({
      queryKey: ["org", slug, "invitations"],
      queryFn: () => apiFetch("/api/org/invitations", { schema: InvitationsResponseSchema }),
    }),
};

/** Filtro de la semana que abre la agenda: la de hoy en la zona del club. */
export function agendaWeekQuery(timezone: string, at = new Date()): URLSearchParams {
  const from = weekStart(timezone, at);
  return new URLSearchParams({
    from: from.toISOString(),
    to: addDays(timezone, from, 7).toISOString(),
  });
}
