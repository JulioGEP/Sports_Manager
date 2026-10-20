"use client";

import { MeResponseSchema, type MeResponse } from "@sportsmanager/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readLocaleCookie, writeLocaleCookie } from "@/components/language-switcher";
import { ApiClientError, apiFetch } from "./api";

export type SessionState =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "authenticated"; me: MeResponse }
  | { kind: "error" };

/** Sesión actual según `/api/me`. La web no guarda nada: pregunta a la API en cada carga. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ kind: "loading" });
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/me", { schema: MeResponseSchema })
      .then((me) => {
        if (cancelled) return;
        setState({ kind: "authenticated", me });
        // Idioma de la persona (Bloque 7): si el perfil tiene uno distinto a la cookie, manda el perfil.
        if (me.user.locale && readLocaleCookie() !== me.user.locale) {
          writeLocaleCookie(me.user.locale);
          router.refresh();
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiClientError && error.status === 401)
          setState({ kind: "anonymous" });
        else setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [router]);
  return state;
}

/** Como `useSession`, pero sin sesión manda al login y vuelve después a la página actual. */
export function useRequiredSession(): SessionState {
  const state = useSession();
  const router = useRouter();
  useEffect(() => {
    if (state.kind === "anonymous") {
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [state.kind, router]);
  return state;
}

export async function signOut(): Promise<void> {
  await apiFetch("/api/auth/sign-out", { method: "POST", body: {} });
}

/** Destino seguro tras el login: solo rutas internas. */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
