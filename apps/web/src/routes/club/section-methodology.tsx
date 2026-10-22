import {
  MethodologyResponseSchema,
  TRAINING_CONTENT_KINDS,
  type MethodologyResponse,
  type TrainingContentKind,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { Link, useParams } from "react-router";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { Alert, ButtonLink, Card, EmptyState, Icon, PageHeader, StatusChip } from "@/ui";

/**
 * Un color por tipo de contenido, todos de la familia del club más el gris de referencia. El color
 * nunca va solo: la leyenda dice el tipo y el porcentaje.
 */
export const KIND_COLORS: Record<TrainingContentKind, string> = {
  technical: "var(--club-fill)",
  tactical: "var(--club-deep)",
  physical: "color-mix(in oklab, var(--club-fill) 50%, var(--surface))",
  set_piece: "var(--chart-reference)",
  goalkeeper: "color-mix(in oklab, var(--club-deep) 45%, var(--surface))",
  psychological: "color-mix(in oklab, var(--chart-reference) 45%, var(--surface))",
};

/** Barra apilada del reparto por tipo de contenido, en porcentaje, con la leyenda en texto. */
export function KindBar({
  shares,
  targets,
  label,
}: {
  /** Porcentaje por tipo (de 0 a 100). */
  shares: Partial<Record<TrainingContentKind, number>>;
  /** Objetivo por tipo, para ponerlo al lado de cada cifra. */
  targets?: Partial<Record<TrainingContentKind, number>> | undefined;
  label: string;
}) {
  const k = useT("contentKinds");
  const t = useT("methodology");
  const kinds = TRAINING_CONTENT_KINDS.filter(
    (kind) => (shares[kind] ?? 0) > 0 || (targets?.[kind] ?? 0) > 0,
  );
  const total = kinds.reduce((acc, kind) => acc + (shares[kind] ?? 0), 0);
  let x = 0;
  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox="0 0 100 6"
        preserveAspectRatio="none"
        className="h-3.5 w-full overflow-hidden rounded-full bg-raised"
        role="img"
        aria-label={label}
      >
        {total > 0
          ? kinds.map((kind) => {
              const w = ((shares[kind] ?? 0) / Math.max(100, total)) * 100;
              const segment = (
                <rect
                  key={kind}
                  x={x}
                  y={0}
                  width={Math.max(0, w - 0.4)}
                  height={6}
                  fill={KIND_COLORS[kind]}
                />
              );
              x += w;
              return w > 0 ? segment : null;
            })
          : null}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-secondary text-muted">
        {kinds.map((kind) => (
          <li key={kind} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block size-3 rounded-sm"
              style={{ background: KIND_COLORS[kind] }}
            />
            <span className="text-ink">{k(kind)}</span>
            <span className="font-mono">{shares[kind] ?? 0} %</span>
            {targets && targets[kind] !== undefined ? (
              <span>{t("target", { value: targets[kind] })}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </figure>
  );
}

const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : null;

/**
 * Metodología de la sección (ADR 0039): lo que la coordinación necesita para ver si se cumple.
 * Arriba, el reparto objetivo de contenidos por categoría; debajo, por equipo, cuántos
 * entrenamientos tienen sesión planificada y cerrada, cómo se reparten los minutos y cuánto se
 * entrena con tareas de la biblioteca oficial.
 */
export function SectionMethodologyPage() {
  const t = useT("methodology");
  const c = useT("common");
  const errors = useT("errors");
  const { id = "" } = useParams();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);

  const query = useQuery({
    queryKey: ["org", slug, "section", id, "methodology"],
    queryFn: () =>
      apiFetch(`/api/org/sections/${id}/methodology`, { schema: MethodologyResponseSchema }),
    retry: false,
  });

  if (query.isError) {
    const notFound = query.error instanceof ApiClientError && query.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(query.error))}</Alert>
    );
  }
  if (!query.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  const { section, categories, methodology, teams, access } = query.data;
  // Una categoría sin objetivo guarda todo a cero (el esquema pide los seis tipos).
  const withTargets = categories.filter((cat) =>
    Object.values(methodology[cat.id] ?? {}).some((v) => v > 0),
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={paths.section(id)}
        backLabel={t("back", { section: section.name })}
        eyebrow={section.name}
        title={t("title")}
        description={t("description")}
        actions={
          access.configure ? (
            <ButtonLink
              to={paths.sectionTrainingConfig(id)}
              variant="secondary"
              icon={<Icon.Sliders size={18} aria-hidden="true" />}
            >
              {t("configure")}
            </ButtonLink>
          ) : null
        }
      />

      <Card title={t("targets.title")} description={t("targets.description")}>
        {withTargets.length === 0 ? (
          <p className="text-secondary text-muted">
            {access.configure ? t("targets.emptyConfigure") : t("targets.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {withTargets.map((cat) => (
              <li key={cat.id} className="flex flex-col gap-1.5">
                <span className="text-body font-medium text-ink">{cat.name}</span>
                <KindBar
                  shares={methodology[cat.id] ?? {}}
                  label={t("targets.summary", { category: cat.name })}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("teams.title")} description={t("teams.description")}>
        {teams.length === 0 ? (
          <EmptyState icon={<Icon.UsersThree weight="duotone" />} title={t("teams.empty")} />
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {teams.map((team) => (
              <li key={team.id} className="py-4 first:pt-0 last:pb-0">
                <TeamRow
                  team={team}
                  targets={
                    team.category && withTargets.some((cat) => cat.id === team.category?.id)
                      ? methodology[team.category.id]
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function TeamRow({
  team,
  targets,
}: {
  team: MethodologyResponse["teams"][number];
  targets: Partial<Record<TrainingContentKind, number>> | undefined;
}) {
  const t = useT("methodology");
  const intl = useIntl();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const planned = percent(team.planned, team.trainings);
  const done = percent(team.done, team.trainings);
  const shares = Object.fromEntries(
    TRAINING_CONTENT_KINDS.map((kind) => [
      kind,
      percent(team.minutesByKind[kind] ?? 0, team.totalMinutes) ?? 0,
    ]),
  ) as Record<TrainingContentKind, number>;
  const plannedKind = planned === null ? "neutral" : planned >= 80 ? "success" : "warning";
  return (
    <article className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <Link
            to={paths.teamTraining(team.id)}
            className="text-body font-semibold text-ink no-underline"
          >
            {team.name}
          </Link>
          <span className="text-secondary text-muted">
            {team.category?.name ?? t("noCategory")}
          </span>
        </div>
        <StatusChip kind={plannedKind}>
          {planned === null ? t("noTrainings") : t("plannedShare", { value: planned })}
        </StatusChip>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={t("metrics.trainings")} value={intl.formatNumber(team.trainings)} />
        <Metric
          label={t("metrics.planned")}
          value={`${team.planned}${planned === null ? "" : ` · ${planned} %`}`}
        />
        <Metric
          label={t("metrics.done")}
          value={`${team.done}${done === null ? "" : ` · ${done} %`}`}
        />
        <Metric
          label={t("metrics.official")}
          value={team.officialShare === null ? "—" : `${team.officialShare} %`}
        />
      </dl>
      {team.totalMinutes > 0 ? (
        <KindBar
          shares={shares}
          targets={targets}
          label={t("teams.summary", {
            team: team.name,
            minutes: intl.formatNumber(team.totalMinutes),
          })}
        />
      ) : (
        <p className="text-secondary text-muted">{t("teams.noMinutes")}</p>
      )}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-field bg-raised px-3 py-2">
      <dt className="text-label text-muted">{label}</dt>
      <dd className="font-mono text-body font-semibold text-ink">{value}</dd>
    </div>
  );
}
