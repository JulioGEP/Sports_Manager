import {
  addDays,
  ResultSavedResponseSchema,
  scoreIsComplete,
  WORKOUT_LEVELS,
  type WorkoutBlockView,
  type WorkoutLevel,
} from "@sportsmanager/shared";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import {
  draftOf,
  EMPTY_SCORE,
  ScoreFields,
  scoreOf,
  type ScoreDraft,
} from "@/components/fitness/athlete-ui";
import { DayStrip } from "@/components/fitness/class-row";
import { WorkoutBlockCard } from "@/components/fitness/workout-blocks";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { daysFrom, useClassTime, useInvalidateFitness, useMyWorkouts } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  ButtonLink,
  EmptyState,
  Field,
  Icon,
  PageHeader,
  Segmented,
  Sheet,
  StatusChip,
  useToast,
} from "@/ui";

/**
 * El WOD (ADR 0049): lo publicado del día con los kilos de cada atleta (de su 1RM) y, en cada
 * bloque, su resultado y la clasificación. Se apunta desde el móvil al acabar: nivel, marcador,
 * cómo ha ido. Si supera su máxima, es un PR y entra solo en sus marcas.
 */
export function WodPage() {
  const t = useT("fitness.athlete.wod");
  const errors = useT("errors");
  const levels = useT("fitness.common.levels");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const time = useClassTime();
  const [params, setParams] = useSearchParams();
  const days = daysFrom(addDays(time.today, -3), 5);
  const requested = params.get("date");
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : time.today;
  const workouts = useMyWorkouts(date);
  const [editing, setEditing] = useState<WorkoutBlockView | null>(null);
  const future = date > time.today;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <DayStrip
        days={days.includes(date) ? days : [...days, date].sort()}
        selected={date}
        onSelect={(d) => setParams(d === time.today ? {} : { date: d }, { replace: true })}
        label={t("days")}
      />

      {workouts.isPending ? (
        <div className="h-64 animate-pulse rounded-card bg-raised" aria-busy="true" />
      ) : workouts.isError ? (
        <Alert kind="error">{errors(errorKey(workouts.error))}</Alert>
      ) : workouts.data.workouts.length === 0 ? (
        <EmptyState
          icon={<Icon.Barbell size={28} weight="duotone" aria-hidden="true" />}
          title={t("emptyTitle")}
          description={future ? t("emptyFuture") : t("emptyHint")}
        />
      ) : (
        workouts.data.workouts.map((w) => (
          <section key={w.id} className="flex flex-col gap-4" aria-labelledby={`wod-${w.id}`}>
            <header className="flex flex-col gap-1">
              <span className="text-label uppercase tracking-wide text-muted">
                {w.section.name}
                {w.team ? ` · ${w.team.name}` : ""}
              </span>
              <h2 id={`wod-${w.id}`} className="text-title2 text-ink">
                {w.title ?? time.day(w.onDate)}
              </h2>
              {w.notes ? (
                <p className="whitespace-pre-line text-body text-muted">{w.notes}</p>
              ) : null}
            </header>
            {w.blocks.map((block) => {
              const result = block.mine?.result ?? null;
              return (
                <WorkoutBlockCard
                  key={block.id}
                  block={block}
                  footer={
                    block.scoreType === "none" ? null : (
                      <>
                        {result ? (
                          <StatusChip kind="success">
                            {`${levels(result.level)} · ${result.display}`}
                          </StatusChip>
                        ) : null}
                        {future ? null : (
                          <Button
                            size="sm"
                            variant={result ? "secondary" : "primary"}
                            action={result ? "edit" : "add"}
                            onClick={() => setEditing(block)}
                          >
                            {result ? t("editResult") : t("addResult")}
                          </Button>
                        )}
                        <ButtonLink
                          to={paths.leaderboard(block.id)}
                          variant="tertiary"
                          size="sm"
                          icon={<Icon.Trophy size={18} aria-hidden="true" />}
                        >
                          {t("leaderboard", { count: block.results })}
                        </ButtonLink>
                      </>
                    )
                  }
                />
              );
            })}
          </section>
        ))
      )}

      {editing ? (
        <ResultSheet key={editing.id} block={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function ResultSheet({ block, onClose }: { block: WorkoutBlockView; onClose: () => void }) {
  const t = useT("fitness.athlete.result");
  const c = useT("fitness.common");
  const levels = useT("fitness.common.levels");
  const errors = useT("errors");
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const current = block.mine?.result ?? null;
  const [level, setLevel] = useState<WorkoutLevel>(current?.level ?? "rx");
  const [score, setScore] = useState<ScoreDraft>(
    current ? draftOf(current.score, current.completed) : EMPTY_SCORE,
  );
  const [effort, setEffort] = useState<number | null>(current?.effort ?? null);
  const [note, setNote] = useState(current?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = scoreOf(block.scoreType, score);
    const completed = block.scoreType === "time" ? score.completed : true;
    if (!scoreIsComplete(block.scoreType, value, completed)) {
      setInvalid(true);
      return;
    }
    setBusy(true);
    try {
      const saved = await apiFetch(`/api/org/me/results/${block.id}`, {
        method: "PUT",
        body: {
          level,
          score: value,
          completed,
          effort,
          note: note.trim() || null,
        },
        schema: ResultSavedResponseSchema,
      });
      toast("success", saved.personalRecord ? t("pr") : t("saved"));
      await invalidate();
      onClose();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await apiFetch(`/api/org/me/results/${block.id}`, { method: "DELETE" });
      toast("success", t("removed"));
      await invalidate();
      onClose();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={`${block.label} · ${block.title}`}
      description={t("description")}
      footer={
        <>
          {current ? (
            <Button variant="ghost-danger" action="delete" onClick={() => void remove()}>
              {t("remove")}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" type="submit" form="result-form" loading={busy}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="result-form" className="flex flex-col gap-5" onSubmit={(e) => void submit(e)}>
        <div className="flex flex-col gap-1.5">
          <span className="text-secondary font-medium text-ink">{t("level")}</span>
          <Segmented
            label={t("level")}
            value={level}
            onChange={setLevel}
            options={WORKOUT_LEVELS.map((l) => ({ key: l, label: levels(l) }))}
          />
        </div>
        <ScoreFields
          type={block.scoreType}
          value={score}
          onChange={(next) => {
            setScore(next);
            setInvalid(false);
          }}
          timeCap={block.timeCapSeconds !== null}
        />
        {invalid ? (
          <p role="alert" className="text-secondary text-danger">
            {t("missingScore")}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <span className="text-secondary font-medium text-ink" id="effort-label">
            {t("effort")}
          </span>
          <div role="radiogroup" aria-labelledby="effort-label" className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={effort === n}
                aria-label={t(`effortLevel.${n}`)}
                onClick={() => setEffort(effort === n ? null : n)}
                className={`flex h-12 flex-col items-center justify-center rounded-field font-mono text-body ${
                  effort === n ? "bg-club text-on-club" : "bg-raised text-ink hover:bg-raised/70"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <span className="text-secondary text-muted">
            {effort ? t(`effortLevel.${effort}`) : t("effortHint")}
          </span>
        </div>
        <Field label={t("note")}>
          {(id) => (
            <textarea
              id={id}
              rows={2}
              maxLength={400}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-field border border-control bg-surface px-4 py-3 text-body text-ink outline-none focus:border-2 focus:border-club"
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}
