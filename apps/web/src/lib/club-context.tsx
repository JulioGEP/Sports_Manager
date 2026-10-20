"use client";

import {
  MeResponseSchema,
  MyMembershipsResponseSchema,
  OrganizationResponseSchema,
  type MeResponse,
  type MyMembershipsResponse,
  type OrganizationResponse,
} from "@sportsmanager/shared";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiClientError, apiFetch } from "./api";
import { readLocaleCookie, writeLocaleCookie } from "./locale-cookie";

export type ClubState =
  | { kind: "loading" }
  | {
      kind: "ready";
      me: MeResponse;
      org: OrganizationResponse;
      memberships: MyMembershipsResponse["memberships"];
    }
  | { kind: "no_membership"; me: MeResponse; memberships: MyMembershipsResponse["memberships"] }
  | { kind: "error" };

interface ClubContextValue {
  state: ClubState;
  /** Vuelve a pedir club y pertenencias (tras cambiar ajustes o roles). */
  refresh: () => Promise<void>;
}

const ClubContext = createContext<ClubContextValue>({
  state: { kind: "loading" },
  refresh: () => Promise.resolve(),
});

/**
 * Datos de la persona y del club del host, pedidos una sola vez por página (Bloque 8).
 * Sin sesión: redirige al login y vuelve después. La web solo habla con la API por REST.
 */
export function ClubProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<ClubState>({ kind: "loading" });

  const load = useCallback(async () => {
    let me: MeResponse;
    try {
      me = await apiFetch("/api/me", { schema: MeResponseSchema });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        const next = `${window.location.pathname}${window.location.search}`;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      setState({ kind: "error" });
      return;
    }
    if (me.user.locale && readLocaleCookie() !== me.user.locale) {
      writeLocaleCookie(me.user.locale);
      router.refresh();
    }
    const [orgResult, membershipsResult] = await Promise.allSettled([
      apiFetch("/api/org", { schema: OrganizationResponseSchema }),
      apiFetch("/api/me/memberships", { schema: MyMembershipsResponseSchema }),
    ]);
    const memberships =
      membershipsResult.status === "fulfilled" ? membershipsResult.value.memberships : [];
    if (orgResult.status === "fulfilled") {
      setState({ kind: "ready", me, org: orgResult.value, memberships });
      return;
    }
    const error: unknown = orgResult.reason;
    if (error instanceof ApiClientError && (error.status === 403 || error.status === 404)) {
      setState({ kind: "no_membership", me, memberships });
      return;
    }
    setState({ kind: "error" });
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo(() => ({ state, refresh: load }), [state, load]);
  return <ClubContext.Provider value={value}>{children}</ClubContext.Provider>;
}

export function useClub(): ClubContextValue {
  return useContext(ClubContext);
}

/** Solo para páginas dentro del club: el estado ya está listo cuando se renderizan. */
export function useReadyClub() {
  const { state, refresh } = useClub();
  if (state.kind !== "ready") throw new Error("useReadyClub fuera de un club cargado");
  return { ...state, refresh };
}
