import {
  DAY_ROLE_INFO,
  formatSeconds,
  MyLevelsResponseSchema,
  planTestByCode,
  WORKOUT_LEVELS,
  type AthleteLevel,
  type MyCycleResponse,
  type WorkoutLevel,
} from "@sportsmanager/shared";
import { useState } from "react";
import { useIntl } from "react-intl";
import { CAPACITY_COLOR, CycleMap, RoleChip, usePlanNames } from "@/components/fitness/planning-ui";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useClassTime, useInvalidateFitness } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { useLevelName, useMyCycle } from "@/lib/planning";
import { errorKey } from "@/lib/api";
import {
  Alert,
  ButtonLink,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  Segmented,
  Sheet,
  useToast,
} from "@/ui";

/**
 * Tu ciclo (ADR 0053): en qué punto del plan del box estás, tus marcas de partida y lo que puedes
 * esperar con tu frecuencia, tu constancia, lo que te falta esta semana y tu nivel en cada
 * capacidad. El atleta ve hacia dónde va.
 */
export function MyCyclePage() {
  const t = useT("fitness.planning.cycle");
  const cycle = useMyCycle();
  if (cycle.isError)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} />
        <Alert kind="info">{t("noAthlete")}</Alert>
      </div>
    );
  if (!cycle.data)
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="h-40 animate-pulse rounded-card bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  return <CycleView data={cycle.data} />;
}

function CycleView({ data }: { data: MyCycleResponse }) {
  const t = useT("fitness.planning.cycle");
  const names = usePlanNames();
  const intl = useIntl();
  const time = useClassTime();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const plan = data.plan;
  const num = (v: number) => intl.formatNumber(v, { maximumFractionDigits: 1 });
  const valueOf = (code: string, v: number) => {
    const test = planTestByCode(code);
    if (test?.lowerIsBetter) return formatSeconds(Math.round(v));
    if (test?.kind === "movement") return `${num(v)} kg`;
    return num(v);
  };
  const upcoming = data.milestones.filter((m) => m.date >= time.today).slice(0, 4);
  const maxWeek = Math.max(1, ...data.constancy.weeks.map((w) => w.sessions));

  if (!plan)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} description={t("description")} />
        <Card>
          <EmptyState
            icon={<Icon.Target size={28} aria-hidden="true" />}
            title={t("noPlanTitle")}
            description={t("noPlanBody")}
          />
        </Card>
        <LevelsCard levels={data.levels} />
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <ButtonLink
            to={`${paths.cycleSummary}?plan=${plan.id}`}
            variant="secondary"
            action="open"
          >
            {t("summary")}
          </ButtonLink>
        }
      />

      <section className="flex flex-col gap-4 rounded-card bg-ink p-5 text-surface sm:p-6">
        <span className="text-label uppercase tracking-wide opacity-70">{plan.section.name}</span>
        <h2 className="text-title1 lg:text-title1-lg">{plan.name}</h2>
        <p className="text-body opacity-80">
          {plan.week
            ? t("position", { n: plan.week, weeks: plan.weeks, block: plan.blockLabel ?? "" })
            : plan.finished
              ? t("finished")
              : t("startsOn", { date: names.shortDate(plan.startsOn) })}
        </p>
        {plan.blockFocus ? <p className="text-secondary opacity-80">{plan.blockFocus}</p> : null}
        <div className="rounded-control bg-surface p-3 text-ink">
          <CycleMap
            structure={plan.structure}
            startsOn={plan.startsOn}
            current={plan.week}
            compact
          />
        </div>
        {upcoming.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {upcoming.map((m) => (
              <li
                key={`${m.kind}-${m.date}`}
                className="flex items-center gap-3 rounded-control bg-surface/10 px-3 py-2"
              >
                <Icon.FlagCheckered size={18} aria-hidden="true" className="shrink-0 opacity-80" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-secondary font-medium">
                    {t(`milestone.${m.kind}`, { label: m.label })}
                  </span>
                  <span className="text-label opacity-70">{names.shortDate(m.date)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {data.nudge ? (
        <Alert
          kind="info"
          title={t("nudgeTitle", { capacity: names.capacity(data.nudge.capacity) })}
          actions={
            <ButtonLink to={paths.classes} variant="secondary" size="sm" action="open">
              {t("book")}
            </ButtonLink>
          }
        >
          {t("nudgeBody", {
            day: time.weekday(data.nudge.date),
            role: names.role(data.nudge.role),
          })}
        </Alert>
      ) : null}

      <Card
        title={t("thisWeek")}
        description={data.athletePreview === "none" ? t("thisWeekHidden") : t("thisWeekHint")}
      >
        <ol className="grid grid-cols-7 gap-1.5">
          {data.week.map((d) => {
            const info = d.role ? DAY_ROLE_INFO[d.role] : null;
            return (
              <li
                key={d.date}
                className={`flex min-w-0 flex-col items-center gap-1.5 rounded-control px-1 py-2 ${
                  d.date === time.today ? "bg-club-soft" : "bg-raised"
                }`}
                title={d.role ? names.role(d.role) : undefined}
              >
                <span className="text-label font-semibold text-muted">
                  {names.weekdayShort(((new Date(`${d.date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1)}
                </span>
                <span
                  className="size-3 rounded-full"
                  style={{ background: info ? CAPACITY_COLOR[info.capacity] : "var(--color-line)" }}
                  aria-hidden="true"
                />
                {d.attended ? (
                  <Icon.CheckCircle size={16} aria-label={t("attended")} className="text-success" />
                ) : d.booked ? (
                  <Icon.CalendarBlank
                    size={16}
                    aria-label={t("booked")}
                    className="text-club-text"
                  />
                ) : (
                  <span className="h-4" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ol>
        {data.week.some((d) => d.role) ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.week
              .filter((d) => d.role && d.date >= time.today)
              .slice(0, 3)
              .map((d) => (
                <li key={d.date} className="flex items-center gap-2 text-secondary">
                  <span className="text-muted first-letter:uppercase">
                    {time.weekday(d.date, "short")}
                  </span>
                  <RoleChip role={d.role!} />
                </li>
              ))}
          </ul>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("tests")} description={t("testsHint", { days: data.frequency })}>
          {data.tests.length === 0 ? (
            <p className="text-secondary text-muted">{t("noTests")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.tests.map((test) => (
                <li
                  key={test.code}
                  className="flex flex-col gap-1 rounded-control bg-raised px-3 py-2.5"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">{names.test(test.code)}</span>
                    <span className="font-mono text-secondary text-ink">
                      {test.baseline !== null ? valueOf(test.code, test.baseline) : t("noBaseline")}
                    </span>
                  </span>
                  {test.low !== null && test.high !== null ? (
                    <span className="text-label text-muted">
                      {t("range", {
                        low: valueOf(test.code, Math.min(test.low, test.high)),
                        high: valueOf(test.code, Math.max(test.low, test.high)),
                      })}
                    </span>
                  ) : (
                    <span className="text-label text-muted">{t("rangeNoBaseline")}</span>
                  )}
                  {test.latest !== null ? (
                    <span className="text-label font-medium text-success">
                      {t("latest", { value: valueOf(test.code, test.latest) })}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-label text-muted">{t("orientative")}</p>
        </Card>

        <Card
          title={t("constancy")}
          description={t("constancyHint", {
            sessions: data.constancy.sessions,
            perWeek: num(data.constancy.perWeek),
          })}
        >
          {data.constancy.weeks.length === 0 ? (
            <p className="text-secondary text-muted">{t("constancyEmpty")}</p>
          ) : (
            <div className="flex h-32 items-end gap-1" role="img" aria-label={t("constancyChart")}>
              {data.constancy.weeks.map((w) => (
                <div key={w.n} className="flex flex-1 flex-col items-center gap-1">
                  <span className="font-mono text-label text-muted">{w.sessions || ""}</span>
                  <span
                    className={`w-full rounded-t-sm ${w.n === plan.week ? "bg-club" : "bg-ink"}`}
                    style={{ height: `${Math.max(4, (w.sessions / maxWeek) * 88)}px` }}
                  />
                  <span className="font-mono text-label text-muted">{w.n}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <LevelsCard levels={data.levels} />
    </div>
  );
}

/** Tu nivel en cada capacidad: el sugerido con tus resultados o el que fijas tú. */
function LevelsCard({ levels }: { levels: AthleteLevel[] }) {
  const t = useT("fitness.planning.cycle");
  const errors = useT("errors");
  const names = usePlanNames();
  const levelName = useLevelName();
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const [editing, setEditing] = useState<AthleteLevel | null>(null);
  const [saving, setSaving] = useState(false);
  const c = useT("fitness.common");

  async function save(level: WorkoutLevel | null) {
    if (!editing) return;
    setSaving(true);
    try {
      await apiFetch("/api/org/me/levels", {
        method: "PUT",
        body: { capacity: editing.capacity, level },
        schema: MyLevelsResponseSchema,
      });
      await invalidate();
      toast("success", t("levelSaved"));
      setEditing(null);
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title={t("levels")} description={t("levelsHint")}>
      <ul className="grid gap-2 sm:grid-cols-2">
        {levels.map((l) => (
          <li key={l.capacity}>
            <button
              type="button"
              onClick={() => setEditing(l)}
              className="flex w-full items-center gap-3 rounded-control border border-line bg-surface px-3 py-2.5 text-left hover:bg-raised"
            >
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-full"
                style={{ background: CAPACITY_COLOR[l.capacity] }}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium text-ink">{names.capacity(l.capacity)}</span>
                <span className="text-label text-muted">{t(`reason.${l.reason}`)}</span>
              </span>
              <span className="font-semibold text-ink">{levelName(l.level)}</span>
              <Icon.PencilSimple size={16} aria-hidden="true" className="text-muted" />
            </button>
          </li>
        ))}
      </ul>
      {editing ? (
        <Sheet
          open
          onClose={() => setEditing(null)}
          closeLabel={c("close")}
          title={t("levelTitle", { capacity: names.capacity(editing.capacity) })}
          description={t("levelSuggested", { level: levelName(editing.suggested) })}
        >
          <div className="flex flex-col gap-4">
            <Segmented<WorkoutLevel>
              label={t("levels")}
              value={editing.level}
              onChange={(v) => void save(v)}
              options={WORKOUT_LEVELS.map((l) => ({ key: l, label: levelName(l) }))}
            />
            {editing.reason === "confirmed" ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(null)}
                className="w-fit text-secondary font-medium text-club-text"
              >
                {t("backToSuggested")}
              </button>
            ) : null}
            <p className="text-label text-muted">{t("levelExplain")}</p>
          </div>
        </Sheet>
      ) : null}
    </Card>
  );
}
