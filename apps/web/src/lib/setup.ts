import type { ActionKind } from "@sportsmanager/design";
import {
  InvitationsResponseSchema,
  MembersResponseSchema,
  StructureSummarySchema,
} from "@sportsmanager/shared";
import { brandTokens } from "@sportsmanager/shared/design";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";
import { clubPaths, useReadyClub } from "./club";

export type SetupStepKey = "logo" | "colors" | "season" | "section" | "invite";

export interface SetupStep {
  key: SetupStepKey;
  /** Icono de la acción que propone (DESIGN.md 8.1). */
  icon: ActionKind;
  done: boolean;
  /** Dónde se hace. */
  to: string;
}

/** Quien entra a entrenar o a ayudar en el club: lo que cuenta como "primer entrenador o personal". */
const STAFF_ROLES = new Set(["coach", "staff"]);

/**
 * Lo que le falta al club para estar listo (puesta en marcha, ADR 0045): identidad, la temporada,
 * la primera sección e invitar al primer entrenador o personal. `loading` mientras falte algún
 * dato: así no se ve como pendiente un paso que ya está hecho.
 */
export function useSetup(enabled = true) {
  const { slug, org, branding } = useReadyClub();
  const paths = clubPaths(slug);
  const permissions = org.actor.permissions;
  const summary = useQuery({
    queryKey: ["org", slug, "summary"],
    queryFn: () => apiFetch("/api/org/summary", { schema: StructureSummarySchema }),
    enabled: enabled && permissions.includes("org.structure.read"),
  });
  const members = useQuery({
    queryKey: ["org", slug, "members"],
    queryFn: () => apiFetch("/api/org/members", { schema: MembersResponseSchema }),
    enabled: enabled && permissions.includes("org.members.read"),
  });
  const invitations = useQuery({
    queryKey: ["org", slug, "invitations"],
    queryFn: () => apiFetch("/api/org/invitations", { schema: InvitationsResponseSchema }),
    enabled: enabled && permissions.includes("org.members.invite"),
  });
  const defaultColors =
    branding.brandPrimaryColor === brandTokens["--color-brand-primary"] &&
    branding.brandSecondaryColor === brandTokens["--color-brand-secondary"];
  const staff = (members.data?.members ?? []).filter((m) =>
    m.roles.some((r) => STAFF_ROLES.has(r)),
  ).length;
  // La invitación a la administración del club (la que manda el negocio) no es personal.
  const pending = (invitations.data?.invitations ?? []).filter(
    (i) => i.state === "pending" && STAFF_ROLES.has(i.roleCode),
  ).length;
  const season = Boolean(summary.data?.currentSeason);
  const steps: SetupStep[] = [
    {
      key: "logo",
      icon: "upload",
      done: Boolean(branding.logoUrl),
      to: `${paths.settings}?tab=identity`,
    },
    { key: "colors", icon: "edit", done: !defaultColors, to: `${paths.settings}?tab=identity` },
    { key: "season", icon: "add", done: season, to: `${paths.settings}?tab=seasons&new=1` },
    {
      key: "section",
      icon: "add",
      done: (summary.data?.sections ?? 0) > 0,
      // Sin temporada no hay dónde colgar la sección: primero, la temporada.
      to: season ? `${paths.sections}?new=1` : `${paths.settings}?tab=seasons&new=1`,
    },
    {
      key: "invite",
      icon: "invite",
      done: staff > 0 || pending > 0,
      to: `${paths.staff}?invite=1`,
    },
  ];
  const queries = [summary, members, invitations];
  return {
    steps,
    done: steps.filter((s) => s.done).length,
    loading: queries.some((q) => q.isLoading),
    failed: queries.some((q) => q.isError),
  };
}

const tourKey = (slug: string, userId: string) => `sm.tour.setup.${slug}.${userId}`;

/** Sin almacenamiento se da por visto: mejor no enseñarlo que enseñarlo en cada entrada. */
function readSeen(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return true;
  }
}

/**
 * Recorrido de la puesta en marcha (ADR 0059). Se lanza solo en un club por estrenar (ningún paso
 * hecho) para quien lo administra, y una vez: al saltarlo o terminarlo queda visto en este
 * navegador. Un club con algún paso hecho ya no está por estrenar: también queda visto, y el inicio
 * no vuelve a esperar a la puesta en marcha. `pending` es nulo mientras se sabe si toca.
 */
export function useSetupTour() {
  const { slug, me, org, viewAs } = useReadyClub();
  const key = tourKey(slug, me.user.id);
  const [, setVersion] = useState(0);
  const seen = readSeen(key);
  const eligible =
    org.actor.kind === "member" &&
    org.organization.view === "full" &&
    viewAs === null &&
    org.actor.permissions.includes("org.settings.write");
  const setup = useSetup(eligible && !seen);
  const pending =
    !eligible || seen || setup.failed ? false : setup.loading ? null : setup.done === 0;
  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(key, new Date().toISOString());
    } catch {
      /* sin almacenamiento, ya cuenta como visto */
    }
    setVersion((v) => v + 1);
  }, [key]);
  const started = eligible && !seen && !setup.loading && !setup.failed && setup.done > 0;
  useEffect(() => {
    if (started) markSeen();
  }, [started, markSeen]);
  return { pending, markSeen };
}
