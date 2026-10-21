import {
  CHALLENGE_DESCRIPTION_MAX,
  CHALLENGE_NAME_MAX,
  ChallengeResponseSchema,
  SeasonsResponseSchema,
  type ChallengeManageScope,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { apiFetch, errorKey } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { Alert, Button, Field, Input, Select, Sheet, useToast } from "@/ui";
import {
  ScopeFields,
  resolveScope,
  scopeIsComplete,
  useScopeOptions,
  type ScopeState,
} from "./challenge-scope";

/** Desde dónde se abre la hoja: la ficha de un equipo fija el equipo; la de una sección, la sección. */
export interface ScopeLock {
  sectionId: string;
  sectionName: string;
  teamId: string | null;
  teamName: string | null;
}

/**
 * Nuevo reto (ADR 0032): una sección y, si se quiere, un solo equipo. Abierta desde la ficha de un
 * equipo o de una sección, el ámbito viene dado; desde la vista de conjunto, se elige.
 */
export function NewChallengeSheet({
  open,
  manage,
  lock,
  onClose,
  onCreated,
}: {
  open: boolean;
  manage: ChallengeManageScope;
  lock?: ScopeLock | undefined;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useT("challenges.sheet");
  const ts = useT("challenges.scope");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const seasons = useQuery({
    queryKey: ["org", slug, "seasons"],
    queryFn: () => apiFetch("/api/org/seasons", { schema: SeasonsResponseSchema }),
    enabled: open,
  });
  const currentSeason = seasons.data?.seasons.find((s) => s.isCurrent) ?? null;
  const scopeOptions = useScopeOptions(manage, open);
  const [scope, setScope] = useState<ScopeState>(() =>
    lock
      ? {
          sectionId: lock.sectionId,
          kind: lock.teamId ? "team" : "section",
          teamId: lock.teamId ?? "",
        }
      : { sectionId: "", kind: "section", teamId: "" },
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [minPoints, setMinPoints] = useState("50");
  const [targetPoints, setTargetPoints] = useState("150");
  const [withDefaultTasks, setWithDefaultTasks] = useState(true);
  const [activate, setActivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const season = seasonId ?? currentSeason?.id ?? "";
  const scopeLock = lock
    ? lock.teamId
      ? {
          kind: "team" as const,
          label: ts("lockedTeam", { team: lock.teamName ?? "", section: lock.sectionName }),
        }
      : { kind: "section" as const, label: ts("lockedSection", { section: lock.sectionName }) }
    : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (Number(targetPoints) < Number(minPoints)) {
      setError(t("pointsOrder"));
      return;
    }
    const resolved = resolveScope(scopeOptions, scope);
    if (!scopeIsComplete(scopeOptions, scope)) return;
    setBusy(true);
    try {
      const created = await apiFetch("/api/org/challenges", {
        method: "POST",
        body: {
          name,
          description: description.trim() || null,
          sectionId: resolved.sectionId,
          teamId: resolved.teamId,
          seasonId: season || null,
          startsOn: startsOn || null,
          endsOn: endsOn || null,
          minPoints: Number(minPoints),
          targetPoints: Number(targetPoints),
          status: activate ? "active" : "draft",
          withDefaultTasks,
        },
        schema: ChallengeResponseSchema,
      });
      toast("success", t("created", { name: created.challenge.name }));
      setName("");
      setDescription("");
      onClose();
      onCreated(created.challenge.id);
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            type="submit"
            form="challenge-form"
            loading={busy}
            disabled={!scopeIsComplete(scopeOptions, scope)}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="challenge-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <ScopeFields options={scopeOptions} state={scope} onChange={setScope} lock={scopeLock} />
        <Field label={t("name")} hint={t("nameHint")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={CHALLENGE_NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("descriptionLabel")}>
          {(id) => (
            <Input
              id={id}
              maxLength={CHALLENGE_DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("startsOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("endsOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("minPoints")} hint={t("minPointsHint")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                required
                className="font-mono"
                value={minPoints}
                onChange={(e) => setMinPoints(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("targetPoints")} hint={t("targetPointsHint")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                required
                className="font-mono"
                value={targetPoints}
                onChange={(e) => setTargetPoints(e.target.value)}
              />
            )}
          </Field>
        </div>
        {seasons.data && seasons.data.seasons.length > 0 ? (
          <Field label={t("season")}>
            {(id) => (
              <Select id={id} value={season} onChange={(e) => setSeasonId(e.target.value)}>
                <option value="">{t("noSeason")}</option>
                {seasons.data.seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <label className="flex min-h-12 items-center gap-3 text-body text-ink">
          <input
            type="checkbox"
            className="size-5 accent-[var(--club-fill)]"
            checked={withDefaultTasks}
            onChange={(e) => setWithDefaultTasks(e.target.checked)}
          />
          <span className="flex flex-col">
            <span>{t("withDefaultTasks")}</span>
            <span className="text-secondary text-muted">{t("withDefaultTasksHint")}</span>
          </span>
        </label>
        <label className="flex min-h-12 items-center gap-3 text-body text-ink">
          <input
            type="checkbox"
            className="size-5 accent-[var(--club-fill)]"
            checked={activate}
            onChange={(e) => setActivate(e.target.checked)}
          />
          <span className="flex flex-col">
            <span>{t("activate")}</span>
            <span className="text-secondary text-muted">{t("activateHint")}</span>
          </span>
        </label>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}
