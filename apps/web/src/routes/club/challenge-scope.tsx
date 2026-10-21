import {
  SectionsResponseSchema,
  TeamsResponseSchema,
  type ChallengeManageScope,
  type ChallengeSummary,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { Field, Select } from "@/ui";

/**
 * Ámbito de un reto (ADR 0032): una sección y, si se quiere, un solo equipo de esa sección.
 * Quien gestiona retos de todo el club elige cualquier sección o equipo; quien solo gestiona lo
 * suyo (la entrenadora) elige entre los equipos que lleva, siempre como reto de equipo.
 */

export type ScopeKind = "section" | "team";

export interface ScopeState {
  sectionId: string;
  kind: ScopeKind;
  teamId: string;
}

export interface ScopeOptions {
  loading: boolean;
  sections: { id: string; name: string }[];
  teams: { id: string; name: string; sectionId: string }[];
  /** Solo retos de equipo: quien pregunta no gestiona retos de toda la sección. */
  teamOnly: boolean;
}

export function useScopeOptions(manage: ChallengeManageScope, enabled: boolean): ScopeOptions {
  const { slug } = useReadyClub();
  const sections = useQuery({
    queryKey: ["org", slug, "sections", null],
    queryFn: () => apiFetch("/api/org/sections", { schema: SectionsResponseSchema }),
    enabled,
  });
  const teams = useQuery({
    queryKey: ["org", slug, "teams", null],
    queryFn: () => apiFetch("/api/org/teams", { schema: TeamsResponseSchema }),
    enabled,
  });
  const sectionRows = sections.data?.sections;
  const teamRows = teams.data?.teams;
  return useMemo(() => {
    const own = manage.scope === "own";
    const allTeams = (teamRows ?? [])
      .filter((t) => t.status === "active" && (!own || manage.ownTeamIds.includes(t.id)))
      .map((t) => ({ id: t.id, name: t.name, sectionId: t.section.id }));
    const allSections = (sectionRows ?? [])
      .filter((s) => s.status === "active" && (!own || allTeams.some((t) => t.sectionId === s.id)))
      .map((s) => ({ id: s.id, name: s.name }));
    return {
      loading: enabled && (sections.isPending || teams.isPending),
      sections: allSections,
      teams: allTeams,
      teamOnly: own,
    };
  }, [manage, sectionRows, teamRows, enabled, sections.isPending, teams.isPending]);
}

/** El ámbito efectivo a partir de lo elegido: la primera opción válida cuando lo elegido no vale. */
export function resolveScope(
  options: ScopeOptions,
  state: ScopeState,
): { sectionId: string; kind: ScopeKind; teamId: string | null; teams: ScopeOptions["teams"] } {
  const sectionId = options.sections.some((s) => s.id === state.sectionId)
    ? state.sectionId
    : (options.sections[0]?.id ?? "");
  const teams = options.teams.filter((t) => t.sectionId === sectionId);
  const kind: ScopeKind = options.teamOnly ? "team" : state.kind;
  const teamId =
    kind === "team"
      ? teams.some((t) => t.id === state.teamId)
        ? state.teamId
        : (teams[0]?.id ?? null)
      : null;
  return { sectionId, kind, teamId, teams };
}

/** Si lo elegido se puede enviar: hay sección y, en un reto de equipo, hay equipo. */
export function scopeIsComplete(options: ScopeOptions, state: ScopeState): boolean {
  const resolved = resolveScope(options, state);
  return resolved.sectionId !== "" && (resolved.kind === "section" || resolved.teamId !== null);
}

export function scopeStateOf(challenge: ChallengeSummary): ScopeState {
  return {
    sectionId: challenge.section.id,
    kind: challenge.team ? "team" : "section",
    teamId: challenge.team?.id ?? "",
  };
}

export function ScopeFields({
  options,
  state,
  onChange,
}: {
  options: ScopeOptions;
  state: ScopeState;
  onChange: (next: ScopeState) => void;
}) {
  const t = useT("challenges.scope");
  const resolved = resolveScope(options, state);
  if (!options.loading && options.sections.length === 0) {
    return (
      <p className="text-secondary text-muted">
        {options.teamOnly ? t("noOwnTeams") : t("noSections")}
      </p>
    );
  }
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("section")}>
          {(id) => (
            <Select
              id={id}
              value={resolved.sectionId}
              onChange={(e) => onChange({ ...state, sectionId: e.target.value, teamId: "" })}
            >
              {options.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("kind")} hint={options.teamOnly ? t("ownHint") : t("kindHint")}>
          {(id) => (
            <Select
              id={id}
              value={resolved.kind}
              disabled={options.teamOnly}
              onChange={(e) => onChange({ ...state, kind: e.target.value as ScopeKind })}
            >
              {options.teamOnly ? null : <option value="section">{t("wholeSection")}</option>}
              <option value="team">{t("oneTeam")}</option>
            </Select>
          )}
        </Field>
      </div>
      {resolved.kind === "team" ? (
        <Field
          label={t("team")}
          hint={!options.loading && resolved.teams.length === 0 ? t("noTeams") : undefined}
        >
          {(id) => (
            <Select
              id={id}
              value={resolved.teamId ?? ""}
              onChange={(e) => onChange({ ...state, teamId: e.target.value })}
            >
              {resolved.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
    </>
  );
}

/** "Fútbol sala · Alevín A" o "Fútbol sala · toda la sección", para listas y cabeceras. */
export function useScopeLabel() {
  const t = useT("challenges.scope");
  return (challenge: Pick<ChallengeSummary, "section" | "team">) =>
    `${challenge.section.name} · ${challenge.team ? challenge.team.name : t("wholeSectionShort")}`;
}
