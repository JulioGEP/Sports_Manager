import { MeResponseSchema, type MeResponse } from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { ApiClientError, apiFetch } from "./api";
import { useLocale } from "./intl";
import { isLocale } from "./locale";

export type SessionState =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "authenticated"; me: MeResponse }
  | { kind: "error" };

export const ME_QUERY = ["me"] as const;

export async function fetchMe(): Promise<MeResponse | null> {
  try {
    return await apiFetch("/api/me", { schema: MeResponseSchema, club: null });
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error;
  }
}

/** Sesión actual según `/api/me`. El idioma del perfil manda sobre la cookie. */
export function useSession(): SessionState {
  const { locale, setLocale } = useLocale();
  const query = useQuery({ queryKey: ME_QUERY, queryFn: fetchMe, staleTime: 60_000, retry: false });
  const profileLocale = query.data?.user.locale;
  useEffect(() => {
    if (isLocale(profileLocale) && profileLocale !== locale) setLocale(profileLocale);
  }, [profileLocale, locale, setLocale]);
  if (query.isPending) return { kind: "loading" };
  if (query.isError) return { kind: "error" };
  if (query.data === null) return { kind: "anonymous" };
  return { kind: "authenticated", me: query.data };
}

/** Como `useSession`, pero sin sesión manda al login indicado y vuelve después a la página actual. */
export function useRequiredSession(loginPath = "/login"): SessionState {
  const state = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (state.kind === "anonymous") {
      const next = `${location.pathname}${location.search}`;
      void navigate(`${loginPath}?next=${encodeURIComponent(next)}`, { replace: true });
    }
  }, [state.kind, navigate, loginPath, location.pathname, location.search]);
  return state;
}

export function useSignOut() {
  const client = useQueryClient();
  return async () => {
    try {
      await apiFetch("/api/auth/sign-out", { method: "POST", body: {}, club: null });
    } finally {
      await client.resetQueries();
    }
  };
}

/** Destino seguro tras el login: solo rutas internas. */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
