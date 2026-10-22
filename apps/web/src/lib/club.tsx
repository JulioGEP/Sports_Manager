import {
  MyMembershipsResponseSchema,
  OrganizationBrandingSchema,
  OrganizationResponseSchema,
  isReservedSubdomain,
  ORGANIZATION_SLUG_PATTERN,
  type MeResponse,
  type MyMembershipsResponse,
  type OrganizationBranding,
  type OrganizationResponse,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useParams } from "react-router";
import { ApiClientError, apiFetch, setCurrentClub, setCurrentViewAs } from "./api";
import { ME_QUERY, fetchMe } from "./session";
import { applyClubColors } from "./theme";

export type ClubState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "anonymous"; branding: OrganizationBranding }
  | {
      kind: "no_membership";
      branding: OrganizationBranding;
      me: MeResponse;
      memberships: MyMembershipsResponse["memberships"];
    }
  | {
      kind: "ready";
      branding: OrganizationBranding;
      me: MeResponse;
      org: OrganizationResponse;
      memberships: MyMembershipsResponse["memberships"];
    }
  | { kind: "error" };

interface ClubContextValue {
  slug: string;
  state: ClubState;
  refresh: () => Promise<void>;
  /** "Ver como" (Bloque 14): la persona elegida, o nula si se mira con los propios ojos. */
  viewAs: string | null;
  setViewAs: (userId: string | null) => Promise<void>;
}

const ClubContext = createContext<ClubContextValue | null>(null);

export function isValidClubSlug(slug: string | undefined): slug is string {
  return Boolean(slug && ORGANIZATION_SLUG_PATTERN.test(slug) && !isReservedSubdomain(slug));
}

/**
 * Espacio de un club (ADR 0027): el slug viene de la ruta (`/demo/...`). Fija la cabecera de
 * club para la API, carga marca, sesión, club y pertenencias, y aplica los colores del club.
 */
const viewAsKey = (slug: string) => `sm.viewAs.${slug}`;

function readViewAs(slug: string | null): string | null {
  if (!slug) return null;
  try {
    return sessionStorage.getItem(viewAsKey(slug));
  } catch {
    return null;
  }
}

export function ClubProvider({ children }: { children: ReactNode }) {
  const { club } = useParams();
  const slug = isValidClubSlug(club) ? club : null;
  const queryClient = useQueryClient();
  const [viewAs, setViewAsState] = useState<string | null>(() => readViewAs(slug));

  useLayoutEffect(() => {
    setCurrentClub(slug);
    setCurrentViewAs(readViewAs(slug));
    setViewAsState(readViewAs(slug));
    return () => {
      setCurrentClub(null);
      setCurrentViewAs(null);
    };
  }, [slug]);

  const setViewAs = useCallback(
    async (userId: string | null) => {
      if (!slug) return;
      try {
        if (userId) sessionStorage.setItem(viewAsKey(slug), userId);
        else sessionStorage.removeItem(viewAsKey(slug));
      } catch {
        // Sin almacenamiento, el cambio dura lo que dure la página.
      }
      setCurrentViewAs(userId);
      setViewAsState(userId);
      // Se vacía la caché del club: lo que vio una persona no puede quedarse en pantalla para otra
      // (una consulta que ahora falla por permisos mantendría los datos anteriores).
      await Promise.all([
        queryClient.resetQueries({ queryKey: ["org", slug] }),
        queryClient.resetQueries({ queryKey: ["agenda", slug] }),
      ]);
    },
    [slug, queryClient],
  );

  const branding = useQuery({
    queryKey: ["branding", slug],
    queryFn: () =>
      apiFetch("/api/org/branding", { schema: OrganizationBrandingSchema, club: slug }),
    enabled: slug !== null,
    retry: false,
    staleTime: 60_000,
  });
  const me = useQuery({ queryKey: ME_QUERY, queryFn: fetchMe, retry: false, staleTime: 60_000 });
  const authenticated = me.data !== null && me.data !== undefined;
  const org = useQuery({
    queryKey: ["org", slug, "self", viewAs],
    queryFn: () => apiFetch("/api/org", { schema: OrganizationResponseSchema, club: slug }),
    enabled: slug !== null && authenticated,
    retry: false,
  });
  const memberships = useQuery({
    queryKey: ["memberships"],
    queryFn: () =>
      apiFetch("/api/me/memberships", { schema: MyMembershipsResponseSchema, club: null }),
    enabled: authenticated,
    retry: false,
  });

  useEffect(() => {
    if (branding.data)
      applyClubColors(branding.data.brandPrimaryColor, branding.data.brandSecondaryColor);
  }, [branding.data]);
  useEffect(() => {
    if (branding.data) document.title = branding.data.name;
  }, [branding.data]);

  const state = useMemo<ClubState>(() => {
    if (!slug) return { kind: "not_found" };
    if (branding.isError) {
      const err = branding.error;
      return err instanceof ApiClientError && (err.status === 404 || err.status === 403)
        ? { kind: "not_found" }
        : { kind: "error" };
    }
    if (!branding.data || me.isPending) return { kind: "loading" };
    if (me.isError) return { kind: "error" };
    if (me.data === null) return { kind: "anonymous", branding: branding.data };
    if (org.isPending || memberships.isPending) return { kind: "loading" };
    if (memberships.isError) return { kind: "error" };
    if (org.isError) {
      const err = org.error;
      if (err instanceof ApiClientError && err.status === 403) {
        return {
          kind: "no_membership",
          branding: branding.data,
          me: me.data,
          memberships: memberships.data.memberships,
        };
      }
      return { kind: "error" };
    }
    return {
      kind: "ready",
      branding: branding.data,
      me: me.data,
      org: org.data,
      memberships: memberships.data.memberships,
    };
  }, [slug, branding, me, org, memberships]);

  const value = useMemo<ClubContextValue>(
    () => ({
      slug: slug ?? "",
      state,
      viewAs,
      setViewAs,
      refresh: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["branding", slug] }),
          queryClient.invalidateQueries({ queryKey: ["org", slug] }),
          queryClient.invalidateQueries({ queryKey: ["memberships"] }),
        ]);
      },
    }),
    [slug, state, queryClient, viewAs, setViewAs],
  );

  return <ClubContext.Provider value={value}>{children}</ClubContext.Provider>;
}

export function useClub(): ClubContextValue {
  const value = useContext(ClubContext);
  if (!value) throw new Error("useClub fuera de ClubProvider");
  return value;
}

/** Para páginas que solo se pintan con el club cargado y la persona dentro. */
export function useReadyClub() {
  const { slug, state, refresh, viewAs, setViewAs } = useClub();
  if (state.kind !== "ready") throw new Error("useReadyClub con el club sin cargar");
  return { slug, ...state, refresh, viewAs, setViewAs, base: `/${slug}` };
}

/** Rutas del espacio del club (Bloque 14: secciones, socios, personal, agenda, instalaciones, cuotas). */
export const clubPaths = (slug: string) => ({
  home: `/${slug}`,
  /** Personal del club (antes "miembros"). `/members` redirige aquí. */
  staff: `/${slug}/staff`,
  members: `/${slug}/staff`,
  settings: `/${slug}/settings`,
  sections: `/${slug}/sections`,
  section: (id: string) => `/${slug}/sections/${id}`,
  /** `/teams` redirige a secciones; la ficha de equipo sigue en `/teams/:id`. */
  teams: `/${slug}/sections`,
  team: (id: string) => `/${slug}/teams/${id}`,
  /** Partido en directo (Bloque 20): partidos del equipo, histórico, consola y estadísticas. */
  teamMatches: (id: string) => `/${slug}/teams/${id}/matches`,
  teamMatchHistory: (id: string) => `/${slug}/teams/${id}/matches/history`,
  match: (id: string) => `/${slug}/matches/${id}`,
  matchStats: (id: string) => `/${slug}/matches/${id}/stats`,
  sectionMatchConfig: (id: string) => `/${slug}/sections/${id}/match-config`,
  players: `/${slug}/players`,
  player: (id: string) => `/${slug}/players/${id}`,
  clubMembers: `/${slug}/club-members`,
  clubMember: (id: string) => `/${slug}/club-members/${id}`,
  agenda: `/${slug}/agenda`,
  facilities: `/${slug}/facilities`,
  facility: (id: string) => `/${slug}/facilities/${id}`,
  fees: `/${slug}/fees`,
  family: `/${slug}/family`,
  familyPlayer: (id: string) => `/${slug}/family/${id}`,
  /** Los retos de uno de los suyos, para la familia (ADR 0032): dentro de la ficha del jugador. */
  familyPlayerChallenges: (id: string) => `/${slug}/family/${id}/challenges`,
  /** Vista de conjunto de los retos del club para el personal; sin entrada en la barra. */
  challenges: `/${slug}/challenges`,
  challenge: (id: string) => `/${slug}/challenges/${id}`,
  invitation: (token: string) => `/${slug}/invitations/${token}`,
  /**
   * Entrenamiento (ADR 0038): la portada con los equipos, la semana de cada equipo con su
   * temporada, histórico, carga y tests, la sesión con su modo pista e impresión, la biblioteca,
   * el rendimiento del jugador, la enfermería, los ajustes y la metodología de la sección, y el
   * bienestar del deportista adulto.
   */
  training: `/${slug}/training`,
  teamTraining: (id: string) => `/${slug}/teams/${id}/training`,
  teamTrainingSeason: (id: string) => `/${slug}/teams/${id}/training/season`,
  teamTrainingHistory: (id: string) => `/${slug}/teams/${id}/training/history`,
  teamLoad: (id: string) => `/${slug}/teams/${id}/training/load`,
  teamTests: (id: string) => `/${slug}/teams/${id}/training/tests`,
  session: (id: string) => `/${slug}/sessions/${id}`,
  sessionCourt: (id: string) => `/${slug}/sessions/${id}/court`,
  sessionPrint: (id: string) => `/${slug}/sessions/${id}/print`,
  drills: `/${slug}/drills`,
  drill: (id: string) => `/${slug}/drills/${id}`,
  newDrill: `/${slug}/drills/new`,
  playerPerformance: (id: string) => `/${slug}/players/${id}/performance`,
  infirmary: `/${slug}/infirmary`,
  sectionTrainingConfig: (id: string) => `/${slug}/sections/${id}/training-config`,
  sectionMethodology: (id: string) => `/${slug}/sections/${id}/methodology`,
  athlete: `/${slug}/me`,
});
