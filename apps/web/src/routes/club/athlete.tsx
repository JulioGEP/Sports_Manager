import {
  AthleteResponseSchema,
  WELLNESS_ITEMS,
  type AthleteResponse,
  type WellnessItem,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { RpeScale, ScaleInput, Sparkline } from "@/components/training-ui";
import { apiFetch, errorKey } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  StatusChip,
  useToast,
} from "@/ui";
import { StoreSpotlight } from "./shop";

type Answers = Record<WellnessItem, number | null>;
const EMPTY: Answers = { sleep: null, fatigue: null, soreness: null, stress: null, mood: null };

/**
 * El deportista adulto con su cuenta (ADR 0039): responde cómo llega hoy (cinco preguntas de 1 a
 * 5, 5 es lo mejor) y el esfuerzo de los entrenamientos que acaba de hacer. Pensado para el móvil
 * al salir de entrenar: pocas pantallas, un toque por respuesta.
 */
export function AthletePage() {
  const t = useT("athlete");
  const c = useT("common");
  const errors = useT("errors");
  const { slug } = useReadyClub();

  const query = useQuery({
    queryKey: ["org", slug, "me", "athlete"],
    queryFn: () => apiFetch("/api/org/me/athlete", { schema: AthleteResponseSchema }),
    retry: false,
  });

  if (query.isError) return <Alert kind="error">{errors(errorKey(query.error))}</Alert>;
  if (!query.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  const data = query.data;
  if (!data.player) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t("title")} />
        <Card>
          <EmptyState
            icon={<Icon.Heartbeat weight="duotone" />}
            title={t("noPlayer.title")}
            description={t("noPlayer.description")}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={[data.player.name, data.player.team?.name].filter(Boolean).join(" · ")}
        title={t("title")}
        description={t("description")}
      />
      <PendingRpe data={data} />
      <WellnessCard key={data.wellnessToday?.date ?? "new"} data={data} />
      {/* La tienda del club, fijada (ADR 0041): el adulto compra lo suyo. */}
      <StoreSpotlight />
      <RecentCard data={data} />
    </div>
  );
}

/** Lo primero al salir de entrenar: el esfuerzo de cada sesión pendiente, de 0 a 10. */
function PendingRpe({ data }: { data: AthleteResponse }) {
  const t = useT("athlete");
  const intl = useIntl();
  const { slug, org } = useReadyClub();
  const timezone = org.organization.view === "full" ? org.organization.timezone : "Europe/Madrid";
  if (data.pendingRpe.length === 0) return null;
  return (
    <Card title={t("rpe.title")} description={t("rpe.description")}>
      <ul className="flex flex-col gap-5">
        {data.pendingRpe.map((s) => (
          <li key={s.eventId}>
            <RpeRow
              slug={slug}
              eventId={s.eventId}
              title={s.title}
              when={intl.formatDate(new Date(s.startsAt), {
                weekday: "long",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: timezone,
              })}
              minutes={s.minutes}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RpeRow({
  slug,
  eventId,
  title,
  when,
  minutes,
}: {
  slug: string;
  eventId: string;
  title: string;
  when: string;
  minutes: number;
}) {
  const t = useT("athlete");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const [rpe, setRpe] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (rpe === null) return;
    setBusy(true);
    try {
      const next = await apiFetch(`/api/org/me/athlete/sessions/${eventId}/rpe`, {
        method: "PUT",
        body: { rpe },
        schema: AthleteResponseSchema,
      });
      client.setQueryData(["org", slug, "me", "athlete"], next);
      toast("success", t("rpe.saved"));
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <span className="text-body font-medium text-ink">{title}</span>
        <span className="text-secondary text-muted">
          {when} · {t("rpe.minutes", { minutes })}
        </span>
      </div>
      <RpeScale value={rpe} onChange={setRpe} label={t("rpe.label", { title })} compact />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-secondary text-muted" aria-live="polite">
          {rpe === null ? t("rpe.hint") : t(`rpe.scale.${rpe}`)}
        </span>
        <Button
          action="send"
          size="sm"
          loading={busy}
          disabled={rpe === null}
          onClick={() => void send()}
        >
          {t("rpe.send")}
        </Button>
      </div>
    </div>
  );
}

/** Cómo llega hoy: cinco escalas, la zona si hay molestias y una nota opcional. */
function WellnessCard({ data }: { data: AthleteResponse }) {
  const t = useT("athlete");
  const w = useT("wellness");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const today = data.wellnessToday;
  const [answers, setAnswers] = useState<Answers>(
    today
      ? {
          sleep: today.sleep,
          fatigue: today.fatigue,
          soreness: today.soreness,
          stress: today.stress,
          mood: today.mood,
        }
      : EMPTY,
  );
  const [area, setArea] = useState(today?.sorenessArea ?? "");
  const [note, setNote] = useState(today?.note ?? "");
  const [busy, setBusy] = useState(false);
  const complete = WELLNESS_ITEMS.every((item) => answers[item] !== null);
  const sore = answers.soreness !== null && answers.soreness <= 3;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!complete) return;
    setBusy(true);
    try {
      const next = await apiFetch("/api/org/me/athlete/wellness", {
        method: "PUT",
        body: {
          date: data.today,
          sleep: answers.sleep,
          fatigue: answers.fatigue,
          soreness: answers.soreness,
          stress: answers.stress,
          mood: answers.mood,
          sorenessArea: sore && area.trim() ? area.trim() : null,
          note: note.trim() || null,
        },
        schema: AthleteResponseSchema,
      });
      client.setQueryData(["org", slug, "me", "athlete"], next);
      toast("success", w("saved"));
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={w("today")}
      description={today ? t("wellness.answered") : t("wellness.description")}
      actions={
        today ? <StatusChip kind="club">{w("score", { score: today.score })}</StatusChip> : null
      }
      footer={
        <Button
          action="save"
          type="submit"
          form="athlete-wellness"
          loading={busy}
          disabled={!complete}
        >
          {today ? t("wellness.update") : c("save")}
        </Button>
      }
    >
      <form id="athlete-wellness" className="flex flex-col gap-5" onSubmit={(e) => void submit(e)}>
        {WELLNESS_ITEMS.map((item) => (
          <ScaleInput
            key={item}
            label={w(`items.${item}.label`)}
            lowLabel={w(`items.${item}.low`)}
            highLabel={w(`items.${item}.high`)}
            value={answers[item]}
            onChange={(v) => setAnswers((a) => ({ ...a, [item]: v }))}
          />
        ))}
        {sore ? (
          <Field label={w("sorenessArea")} hint={t("wellness.areaHint")}>
            {(id, describedBy) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                maxLength={60}
                value={area}
                onChange={(e) => setArea(e.target.value)}
              />
            )}
          </Field>
        ) : null}
        <Field label={w("note")} hint={t("wellness.noteHint")}>
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Card>
  );
}

/** Sus últimos días: la suma de cada respuesta, de 5 a 25. Solo se compara consigo mismo. */
function RecentCard({ data }: { data: AthleteResponse }) {
  const t = useT("athlete");
  const w = useT("wellness");
  const dates = useDates();
  const recent = [...data.recent].sort((x, y) => x.date.localeCompare(y.date));
  if (recent.length < 2) return null;
  const mean = Math.round(recent.reduce((acc, r) => acc + r.score, 0) / recent.length);
  return (
    <Card title={t("recent.title")} description={t("recent.description", { mean })}>
      <div className="flex flex-col gap-3">
        <Sparkline
          values={recent.map((r) => r.score)}
          label={t("recent.summary", { days: recent.length, mean })}
        />
        <ul className="flex flex-wrap gap-2">
          {recent.slice(-7).map((r) => (
            <li
              key={r.date}
              className="flex flex-col rounded-field bg-raised px-3 py-2 text-secondary"
            >
              <span className="text-muted">{dates.day(r.date)}</span>
              <span className="font-mono font-semibold text-ink">
                {w("score", { score: r.score })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
