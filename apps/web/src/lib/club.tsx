import {
  MyMembershipsResponseSchema,
  OrganizationBrandingSchema,
  OrganizationResponseSchema,
  isReservedSubdomain,
  ORGANIZATION_SLUG_PATTERN,
  type ClubStyle,
  type MeResponse,
  type MyMembershipsResponse,
  type OrganizationBranding,
  type OrganizationResponse,
} from "@sportsmanager/shared";
import { queryOptions, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
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
import { useLocale } from "./intl";
import { isLocale } from "./locale";
import { prefetchHref } from "./prefetch";
import { meQuery } from "./session";
import { applyClubLook } from "./theme";

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

/**
 * Borrador de la identidad del club (ADR 0043): lo que se está eligiendo en los ajustes y todavía
 * no se ha guardado. Mientras existe, toda la app se pinta y habla con él: es la vista previa.
 */
export type BrandingDraft = Partial<
  Pick<OrganizationBranding, "brandPrimaryColor" | "brandSecondaryColor" | "voice" | "motto">
> & { style?: Partial<ClubStyle> | undefined };

/** La marca guardada con el borrador encima. */
export function withDraft(
  branding: OrganizationBranding,
  draft: BrandingDraft | null,
): OrganizationBranding {
  if (!draft) return branding;
  const { style, ...rest } = draft;
  return { ...branding, ...rest, style: { ...branding.style, ...style } };
}

interface ClubContextValue {
  slug: string;
  state: ClubState;
  /** Marca con la que se pinta el club ahora: la guardada o, en los ajustes, el borrador. */
  look: OrganizationBranding | null;
  setDraft: (draft: BrandingDraft | null) => void;
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

/** Lo que el espacio de un club necesita para pintarse: marca, club (con el actor) y pertenencias. */
export const clubQueries = {
  branding: (slug: string | null) =>
    queryOptions({
      queryKey: ["branding", slug],
      queryFn: () =>
        apiFetch("/api/org/branding", { schema: OrganizationBrandingSchema, club: slug }),
      enabled: slug !== null,
      retry: false,
      staleTime: 60_000,
    }),
  org: (slug: string | null, viewAs: string | null) =>
    queryOptions({
      queryKey: ["org", slug, "self", viewAs],
      queryFn: () => apiFetch("/api/org", { schema: OrganizationResponseSchema, club: slug }),
      enabled: slug !== null,
      retry: false,
    }),
  memberships: () =>
    queryOptions({
      queryKey: ["memberships"],
      queryFn: () =>
        apiFetch("/api/me/memberships", { schema: MyMembershipsResponseSchema, club: null }),
      retry: false,
    }),
};

/**
 * Arranque de un club sin esperas (ADR 0060): marca, sesión, club y pertenencias salen a la vez y
 * en un solo lote, antes incluso de pintar nada. Antes iban en cascada: primero marca y sesión, y
 * solo con la sesión, el club y las pertenencias. Sin sesión, el club y las pertenencias responden
 * 401 y la pantalla manda al login como siempre.
 */
export function prefetchClub(client: QueryClient, pathname: string): void {
  const [, club, area] = pathname.split("/");
  // La aceptación de una invitación vive fuera del espacio del club y pide lo suyo.
  if (!isValidClubSlug(club) || area === "invitations") return;
  const viewAs = readViewAs(club);
  // "Ver como" viaja en la cabecera: la consulta del club tiene que salir ya con la persona elegida.
  setCurrentViewAs(viewAs);
  void client.prefetchQuery(clubQueries.branding(club));
  void client.prefetchQuery(meQuery);
  void client.prefetchQuery(clubQueries.memberships());
  // Con el club (y sus permisos) ya se sabe qué pide la pantalla: sale sin esperar a pintarla.
  client
    .fetchQuery(clubQueries.org(club, viewAs))
    .then((org) => {
      const granted = new Set<string>(org.actor.permissions);
      prefetchHref(
        {
          client,
          slug: club,
          can: (permission) => granted.has(permission),
          timezone: org.organization.view === "full" ? org.organization.timezone : "Europe/Madrid",
        },
        pathname,
      );
    })
    .catch(() => undefined);
}

export function ClubProvider({ children }: { children: ReactNode }) {
  const { club } = useParams();
  const slug = isValidClubSlug(club) ? club : null;
  const queryClient = useQueryClient();
  const [viewAs, setViewAsState] = useState<string | null>(() => readViewAs(slug));
  const [draft, setDraft] = useState<BrandingDraft | null>(null);

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

  const branding = useQuery(clubQueries.branding(slug));
  const me = useQuery(meQuery);
  // El club y las pertenencias no esperan a la sesión: van en el mismo lote que ella.
  const org = useQuery(clubQueries.org(slug, viewAs));
  const memberships = useQuery(clubQueries.memberships());

  // El idioma del perfil manda sobre la cookie (Bloque 7), también si se entra directo a un club.
  const { locale, setLocale } = useLocale();
  const profileLocale = me.data?.user.locale;
  useEffect(() => {
    if (isLocale(profileLocale) && profileLocale !== locale) setLocale(profileLocale);
  }, [profileLocale, locale, setLocale]);

  const look = useMemo(
    () => (branding.data ? withDraft(branding.data, draft) : null),
    [branding.data, draft],
  );
  useEffect(() => {
    if (look) applyClubLook(look);
  }, [look]);
  useEffect(() => {
    if (branding.data) document.title = branding.data.name;
  }, [branding.data]);

  // El estado depende de los datos, no de los objetos de resultado de las consultas, que cambian en
  // cada render: así el contexto no obliga a repintar todo el árbol en cada navegación (ADR 0060).
  const brandingData = branding.data;
  const brandingError = branding.error;
  const meData = me.data;
  const meError = me.isError;
  const mePending = me.isPending;
  const orgData = org.data;
  const orgError = org.error;
  const orgPending = org.isPending;
  const membershipsData = memberships.data;
  const membershipsError = memberships.isError;
  const membershipsPending = memberships.isPending;
  const state = useMemo<ClubState>(() => {
    if (!slug) return { kind: "not_found" };
    if (brandingError) {
      return brandingError instanceof ApiClientError &&
        (brandingError.status === 404 || brandingError.status === 403)
        ? { kind: "not_found" }
        : { kind: "error" };
    }
    if (!brandingData || mePending) return { kind: "loading" };
    if (meError) return { kind: "error" };
    if (meData === null || meData === undefined)
      return { kind: "anonymous", branding: brandingData };
    if (orgPending || membershipsPending) return { kind: "loading" };
    if (membershipsError || !membershipsData) return { kind: "error" };
    if (orgError || !orgData) {
      if (orgError instanceof ApiClientError && orgError.status === 403) {
        return {
          kind: "no_membership",
          branding: brandingData,
          me: meData,
          memberships: membershipsData.memberships,
        };
      }
      return { kind: "error" };
    }
    return {
      kind: "ready",
      branding: brandingData,
      me: meData,
      org: orgData,
      memberships: membershipsData.memberships,
    };
  }, [
    slug,
    brandingData,
    brandingError,
    meData,
    meError,
    mePending,
    orgData,
    orgError,
    orgPending,
    membershipsData,
    membershipsError,
    membershipsPending,
  ]);

  const value = useMemo<ClubContextValue>(
    () => ({
      slug: slug ?? "",
      state,
      look,
      setDraft,
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
    [slug, state, look, queryClient, viewAs, setViewAs],
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
  const { slug, state, look, setDraft, refresh, viewAs, setViewAs } = useClub();
  if (state.kind !== "ready") throw new Error("useReadyClub con el club sin cargar");
  return {
    slug,
    ...state,
    look: look ?? state.branding,
    setDraft,
    refresh,
    viewAs,
    setViewAs,
    base: `/${slug}`,
  };
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
  /** Tienda (ADR 0041): la gestión para quien la lleva y la compra para familias y deportistas. */
  store: `/${slug}/store`,
  storeOrder: (id: string) => `/${slug}/store/orders/${id}`,
  family: `/${slug}/family`,
  familyPlayer: (id: string) => `/${slug}/family/${id}`,
  /** Los retos de uno de los suyos, para la familia (ADR 0032): dentro de la ficha del jugador. */
  familyPlayerChallenges: (id: string) => `/${slug}/family/${id}/challenges`,
  /** Vista de conjunto de los retos del club para el personal; sin entrada en la barra. */
  challenges: `/${slug}/challenges`,
  challenge: (id: string) => `/${slug}/challenges/${id}`,
  invitation: (token: string) => `/${slug}/invitations/${token}`,
  /**
   * Entrenamiento (ADR 0039): la portada con los equipos, la semana de cada equipo con su
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
  /** Lo que entrena el deportista con cuenta propia (ADR 0046): su plan de estos días. */
  athleteTraining: `/${slug}/me/training`,
});
