import {
  AiPlanApplyResponseSchema,
  AiPlanGenerationResponseSchema,
  type AiPlanGeneration,
} from "@sportsmanager/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { ApiClientError, apiFetch } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { fitnessKey, useClassTime, useInvalidateFitness } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { useAiPlanGeneration } from "@/lib/planning";
import { Alert, Button, Field, Icon, Sheet, StatusChip, useToast } from "@/ui";
import { AutoTextarea } from "./programming-blocks";
import { CAPACITY_COLOR } from "./planning-ui";
import { useStaffError } from "./staff-ui";

/** Pedir algo a la IA del plan y seguir la propuesta hasta que esté lista. */
function useAsk(onReady?: (g: AiPlanGeneration) => void) {
  const t = useT("fitness.planning.ai");
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const errorText = useStaffError();
  const [id, setId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const generation = useAiPlanGeneration(id);
  const current = generation.data?.generation ?? null;
  const working = current !== null && (current.status === "queued" || current.status === "running");
  useEffect(() => {
    if (current?.status === "failed") setError(t(`failed.${current.failure ?? "model_error"}`));
    if (current?.status === "ready") onReady?.(current);
    // Solo cuando cambia el estado de la propuesta.
  }, [current?.id, current?.status]);

  async function ask(path: string, body: unknown) {
    setAsking(true);
    setError(null);
    try {
      const res = await apiFetch(path, {
        method: "POST",
        body,
        schema: AiPlanGenerationResponseSchema,
      });
      client.setQueryData(fitnessKey(slug, "planning", "ai", res.generation.id), res);
      setId(res.generation.id);
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.status === 429
          ? t("quota")
          : err instanceof ApiClientError && err.status === 503
            ? t("unavailable")
            : err instanceof ApiClientError && err.status === 409
              ? t("weekFull")
              : errorText(err),
      );
    } finally {
      setAsking(false);
    }
  }
  return { ask, current, working, asking, error, reset: () => setId(null) };
}

/** Aplica lo elegido de una propuesta y refresca lo de fitness. */
function useApply() {
  const t = useT("fitness.planning.ai");
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const errorText = useStaffError();
  const [applying, setApplying] = useState(false);
  async function apply(id: string, indexes: number[] | null) {
    setApplying(true);
    try {
      const res = await apiFetch(`/api/org/plan-ai/${id}/apply`, {
        method: "POST",
        body: indexes ? { indexes } : {},
        schema: AiPlanApplyResponseSchema,
      });
      await invalidate();
      toast("success", t("applied", { applied: res.applied, skipped: res.skipped }));
      return true;
    } catch (err) {
      toast("error", errorText(err));
      return false;
    } finally {
      setApplying(false);
    }
  }
  return { apply, applying };
}

/**
 * El copiloto (ADR 0052): se le pide un cambio en palabras ("el jueves cerramos") y responde con
 * cambios concretos, día a día y con su porqué. Se aceptan todos, algunos o ninguno: nunca cambia
 * nada por su cuenta.
 */
export function CopilotSheet({
  open,
  onClose,
  planId,
  week,
}: {
  open: boolean;
  onClose: () => void;
  planId: string;
  week: number | null;
}) {
  const t = useT("fitness.planning.copilot");
  const c = useT("fitness.common");
  const time = useClassTime();
  const [message, setMessage] = useState("");
  const [chosen, setChosen] = useState<Set<number> | null>(null);
  const { ask, current, working, asking, error, reset } = useAsk((g) => {
    if (g.proposal?.kind === "plan_copilot")
      setChosen(new Set(g.proposal.changes.map((_, i) => i)));
  });
  const { apply, applying } = useApply();
  const proposal =
    current?.status === "ready" && current.proposal?.kind === "plan_copilot"
      ? current.proposal
      : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 3) return;
    setChosen(null);
    void ask(`/api/org/plans/${planId}/copilot`, {
      message: message.trim(),
      ...(week ? { week } : {}),
    });
  };
  const close = () => {
    reset();
    setChosen(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      closeLabel={c("close")}
      title={t("title")}
      description={t("description")}
      footer={
        proposal && !current?.appliedAt ? (
          <>
            <Button variant="tertiary" onClick={close}>
              {t("discard")}
            </Button>
            <Button
              action="approve"
              loading={applying}
              disabled={!chosen || chosen.size === 0}
              onClick={() => {
                if (!current) return;
                void apply(current.id, chosen ? [...chosen] : null).then((ok) => ok && close());
              }}
            >
              {t("apply", { count: chosen?.size ?? 0 })}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {proposal ? null : (
          <form className="flex flex-col gap-3" onSubmit={submit}>
            <Field label={t("message")} hint={t("messageHint")}>
              {(id, describedBy) => (
                <AutoTextarea
                  id={id}
                  rows={3}
                  maxLength={600}
                  aria-describedby={describedBy}
                  value={message}
                  placeholder={t("placeholder")}
                  onChange={(e) => setMessage(e.target.value)}
                />
              )}
            </Field>
            <ul className="flex flex-wrap gap-2" aria-label={t("suggestions")}>
              {(["closed", "noRowers", "benchmark", "lighter"] as const).map((k) => (
                <li key={k}>
                  <button
                    type="button"
                    onClick={() => setMessage(t(`suggestion.${k}`))}
                    className="inline-flex min-h-9 items-center rounded-chip border border-line bg-surface px-3 text-secondary text-ink hover:bg-raised"
                  >
                    {t(`suggestion.${k}`)}
                  </button>
                </li>
              ))}
            </ul>
            {error ? <Alert kind="error">{error}</Alert> : null}
            {working ? <p className="text-secondary text-muted">{t("working")}</p> : null}
            <div className="flex justify-end">
              <Button
                type="submit"
                action="propose"
                loading={asking || working}
                disabled={message.trim().length < 3}
              >
                {t("send")}
              </Button>
            </div>
          </form>
        )}
        {proposal ? (
          <div className="flex flex-col gap-4">
            <div className="flex gap-3 rounded-card bg-raised p-4">
              <Icon.Lightbulb
                size={20}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-club-text"
              />
              <p className="text-body text-ink">{proposal.reply}</p>
            </div>
            {proposal.changes.length === 0 ? (
              <p className="text-secondary text-muted">{t("noChanges")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {proposal.changes.map((change, i) => {
                  const on = chosen?.has(i) ?? false;
                  return (
                    <li key={i}>
                      <label
                        className={`flex gap-3 rounded-control border p-3 ${on ? "border-club" : "border-line"}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 size-4"
                          checked={on}
                          disabled={Boolean(current?.appliedAt)}
                          onChange={() => {
                            const next = new Set(chosen ?? []);
                            if (on) next.delete(i);
                            else next.add(i);
                            setChosen(next);
                          }}
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <StatusChip
                              kind={
                                change.op === "clear"
                                  ? "danger"
                                  : change.op === "note"
                                    ? "neutral"
                                    : "club"
                              }
                            >
                              {t(`op.${change.op}`)}
                            </StatusChip>
                            <span className="text-secondary font-medium text-ink first-letter:uppercase">
                              {time.day(change.date)}
                              {change.toDate ? ` → ${time.day(change.toDate)}` : ""}
                            </span>
                          </span>
                          {change.before || change.after ? (
                            <span className="text-secondary text-ink">
                              {change.before ? (
                                <span className="text-muted line-through">{change.before}</span>
                              ) : null}
                              {change.before && change.after ? " → " : ""}
                              {change.after}
                            </span>
                          ) : null}
                          {change.why ? (
                            <span className="text-label text-muted">{change.why}</span>
                          ) : null}
                          {change.session ? (
                            <span className="flex flex-wrap gap-1.5">
                              {change.session.blocks.map((b, j) => (
                                <span
                                  key={j}
                                  className="inline-flex items-center gap-1 text-label text-muted"
                                >
                                  {b.capacity ? (
                                    <span
                                      aria-hidden="true"
                                      className="size-2 rounded-full"
                                      style={{ background: CAPACITY_COLOR[b.capacity] }}
                                    />
                                  ) : null}
                                  {b.title}
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-label text-muted">{t("neverAlone")}</p>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

/**
 * La semana con IA: el programador escribe los días sin WOD dentro de lo que manda el plan (papel,
 * intención, progresión, cobertura) y el coach elige qué sesiones entran como borrador.
 */
export function AiWeekSheet({
  open,
  onClose,
  planId,
  week,
  missing,
}: {
  open: boolean;
  onClose: () => void;
  planId: string;
  week: number;
  /** Días con clase y sin WOD. */
  missing: number;
}) {
  const t = useT("fitness.planning.aiWeek");
  const c = useT("fitness.common");
  const time = useClassTime();
  const [focus, setFocus] = useState("");
  const [plus, setPlus] = useState(false);
  const [chosen, setChosen] = useState<Set<number> | null>(null);
  const { ask, current, working, asking, error, reset } = useAsk((g) => {
    if (g.proposal?.kind === "plan_week") setChosen(new Set(g.proposal.sessions.map((_, i) => i)));
  });
  const { apply, applying } = useApply();
  const proposal =
    current?.status === "ready" && current.proposal?.kind === "plan_week" ? current.proposal : null;
  const close = () => {
    reset();
    setChosen(null);
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      closeLabel={c("close")}
      title={t("title", { week })}
      description={t("description", { count: missing })}
      footer={
        proposal ? (
          <>
            <Button variant="tertiary" onClick={close}>
              {t("discard")}
            </Button>
            <Button
              action="approve"
              loading={applying}
              disabled={!chosen || chosen.size === 0}
              onClick={() => {
                if (!current) return;
                void apply(current.id, chosen ? [...chosen] : null).then((ok) => ok && close());
              }}
            >
              {t("apply", { count: chosen?.size ?? 0 })}
            </Button>
          </>
        ) : undefined
      }
    >
      {proposal ? (
        <div className="flex flex-col gap-3">
          <p className="text-secondary text-muted">{t("review")}</p>
          <ul className="flex flex-col gap-2">
            {proposal.sessions.map((s, i) => {
              const on = chosen?.has(i) ?? false;
              return (
                <li key={s.date}>
                  <label
                    className={`flex gap-3 rounded-control border p-3 ${on ? "border-club" : "border-line"}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-4"
                      checked={on}
                      onChange={() => {
                        const next = new Set(chosen ?? []);
                        if (on) next.delete(i);
                        else next.add(i);
                        setChosen(next);
                      }}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-label uppercase tracking-wide text-muted">
                        {time.day(s.date)}
                      </span>
                      <span className="font-medium text-ink">{s.title}</span>
                      {s.intentFeel ? (
                        <span className="text-secondary text-muted">{s.intentFeel}</span>
                      ) : null}
                      <span className="flex flex-wrap gap-x-3 gap-y-1">
                        {s.blocks.map((b, j) => (
                          <span
                            key={j}
                            className="inline-flex items-center gap-1 text-label text-ink"
                          >
                            {b.capacity ? (
                              <span
                                aria-hidden="true"
                                className="size-2 rounded-full"
                                style={{ background: CAPACITY_COLOR[b.capacity] }}
                              />
                            ) : null}
                            {b.title}
                            {b.track === "plus" ? (
                              <StatusChip kind="club">{t("plus")}</StatusChip>
                            ) : null}
                          </span>
                        ))}
                      </span>
                      {s.why.length > 0 ? (
                        <span className="text-label text-muted">{s.why.join(" · ")}</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-label text-muted">{t("asDrafts")}</p>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setChosen(null);
            void ask(`/api/org/plans/${planId}/weeks/${week}/ai`, {
              focus: focus.trim() || null,
              plus,
            });
          }}
        >
          <Field label={t("focus")} hint={t("focusHint")}>
            {(id, describedBy) => (
              <AutoTextarea
                id={id}
                rows={2}
                maxLength={500}
                aria-describedby={describedBy}
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
              />
            )}
          </Field>
          <label className="flex items-start gap-3 rounded-control bg-raised p-3">
            <input
              type="checkbox"
              checked={plus}
              onChange={(e) => setPlus(e.target.checked)}
              className="mt-1 size-4"
            />
            <span className="flex flex-col">
              <span className="font-medium text-ink">{t("withPlus")}</span>
              <span className="text-secondary text-muted">{t("withPlusHint")}</span>
            </span>
          </label>
          {error ? <Alert kind="error">{error}</Alert> : null}
          {working ? <p className="text-secondary text-muted">{t("working")}</p> : null}
          {current ? (
            <p className="text-label text-muted">
              {t("remaining", { remaining: current.quota.remaining })}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button
              type="submit"
              action="propose"
              loading={asking || working}
              disabled={missing === 0}
            >
              {t("send")}
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
