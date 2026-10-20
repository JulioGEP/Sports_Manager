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
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useParams } from "react-router";
import { ApiClientError, apiFetch, setCurrentClub } from "./api";
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
}

const ClubContext = createContext<ClubContextValue | null>(null);

export function isValidClubSlug(slug: string | undefined): slug is string {
  return Boolean(slug && ORGANIZATION_SLUG_PATTERN.test(slug) && !isReservedSubdomain(slug));
}

/**
 * Espacio de un club (ADR 0027): el slug viene de la ruta (`/demo/...`). Fija la cabecera de
 * club para la API, carga marca, sesión, club y pertenencias, y aplica los colores del club.
 */
export function ClubProvider({ children }: { children: ReactNode }) {
  const { club } = useParams();
  const slug = isValidClubSlug(club) ? club : null;
  const queryClient = useQueryClient();

  useLayoutEffect(() => {
    setCurrentClub(slug);
    return () => setCurrentClub(null);
  }, [slug]);

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
    queryKey: ["org", slug],
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
      refresh: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["branding", slug] }),
          queryClient.invalidateQueries({ queryKey: ["org", slug] }),
          queryClient.invalidateQueries({ queryKey: ["memberships"] }),
        ]);
      },
    }),
    [slug, state, queryClient],
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
  const { slug, state, refresh } = useClub();
  if (state.kind !== "ready") throw new Error("useReadyClub con el club sin cargar");
  return { slug, ...state, refresh, base: `/${slug}` };
}

/** Rutas del espacio del club. */
export const clubPaths = (slug: string) => ({
  home: `/${slug}`,
  members: `/${slug}/members`,
  settings: `/${slug}/settings`,
  teams: `/${slug}/teams`,
  team: (id: string) => `/${slug}/teams/${id}`,
  players: `/${slug}/players`,
  player: (id: string) => `/${slug}/players/${id}`,
  family: `/${slug}/family`,
  invitation: (token: string) => `/${slug}/invitations/${token}`,
});
