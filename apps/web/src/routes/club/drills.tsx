import {
  DRILL_SCOPES,
  DrillsResponseSchema,
  type DrillScope,
  type DrillSummary,
  type DrillsResponse,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useIntl } from "react-intl";
import { Link, useSearchParams } from "react-router";
import { ContentChips, DrillBoard, RestrictionTags, useLoadFormat } from "@/components/training-ui";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  ButtonLink,
  EmptyState,
  Icon,
  Input,
  PageHeader,
  Select,
  StatusChip,
} from "@/ui";

/** Dónde vive una tarea: el club, su sección, su equipo o quien la creó. */
export function useDrillWhere() {
  const s = useT("drillScopes");
  return (drill: Pick<DrillSummary, "scope" | "section" | "team">) =>
    drill.scope === "section"
      ? (drill.section?.name ?? s("section"))
      : drill.scope === "team"
        ? (drill.team?.name ?? s("team"))
        : s(drill.scope);
}

/** Jugadores de la tarea en texto corto, o nada si no los dice. */
export function useDrillPlayers() {
  const t = useT("drills");
  return (min: number | null, max: number | null) =>
    min && max
      ? t("playersRange", { min, max })
      : min
        ? t("playersFrom", { min })
        : max
          ? t("playersUpTo", { max })
          : null;
}

/**
 * Biblioteca de tareas (ADR 0039): las del club, las de las secciones y equipos del ámbito y las
 * propias. Los filtros de contenido, sección o equipo y archivadas van a la API y viven en la URL
 * (así enlazan los contenidos de una recomendación); el texto y el ámbito filtran aquí.
 */
export function DrillsPage() {
  const t = useT("drills");
  const s = useT("drillScopes");
  const c = useT("common");
  const errors = useT("errors");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const content = params.get("content") ?? "";
  const section = params.get("section") ?? "";
  const team = params.get("team") ?? "";
  const scopeParam = params.get("scope");
  const scope = DRILL_SCOPES.includes(scopeParam as DrillScope) ? (scopeParam as DrillScope) : "";
  const archived = params.get("archived") === "1";

  function setFilter(next: Record<string, string>) {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    setParams(merged, { replace: true });
  }

  const search = new URLSearchParams();
  if (content) search.set("content", content);
  if (section) search.set("section", section);
  if (team) search.set("team", team);
  if (archived) search.set("archived", "1");
  const qs = search.toString();

  const list = useQuery({
    queryKey: ["org", slug, "drills", qs],
    queryFn: () =>
      apiFetch(`/api/org/drills${qs ? `?${qs}` : ""}`, { schema: DrillsResponseSchema }),
    retry: false,
    placeholderData: (previous) => previous,
  });

  if (list.isError) {
    const notFound = list.error instanceof ApiClientError && list.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(list.error))}</Alert>
    );
  }
  if (!list.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-12 animate-pulse rounded-field bg-raised" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-card bg-raised" />
          ))}
        </div>
      </div>
    );
  }

  const data = list.data;
  const needle = query.trim().toLocaleLowerCase();
  const drills = data.drills.filter(
    (d) =>
      (!scope || d.scope === scope) &&
      (!needle ||
        [d.name, d.format ?? "", ...d.contents.map((x) => x.name)].some((text) =>
          text.toLocaleLowerCase().includes(needle),
        )),
  );
  const filtered = Boolean(content || section || team || scope || archived || needle);
  const where = section ? `s:${section}` : team ? `t:${team}` : "";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={paths.training}
        backLabel={t("backToTraining")}
        title={t("title")}
        description={t("description")}
        actions={
          data.access.create ? (
            <ButtonLink
              to={`${paths.newDrill}${content ? `?content=${content}` : ""}`}
              action="add"
            >
              {t("new")}
            </ButtonLink>
          ) : null
        }
      />

      <section aria-label={t("filters.label")} className="flex flex-col gap-3">
        <div className="relative w-full">
          <Icon.MagnifyingGlass
            size={20}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            className="pl-11"
            placeholder={t("search")}
            aria-label={t("search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <ContentSelect
            data={data}
            value={content}
            onChange={(value) => setFilter({ content: value })}
          />
          <Select
            aria-label={t("filters.scope")}
            value={scope}
            onChange={(e) => setFilter({ scope: e.target.value })}
          >
            <option value="">{t("filters.allScopes")}</option>
            {DRILL_SCOPES.map((key) => (
              <option key={key} value={key}>
                {s(key)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t("filters.where")}
            value={where}
            onChange={(e) => {
              const value = e.target.value;
              setFilter({
                section: value.startsWith("s:") ? value.slice(2) : "",
                team: value.startsWith("t:") ? value.slice(2) : "",
              });
            }}
          >
            <option value="">{t("filters.everywhere")}</option>
            {data.sections.length > 0 ? (
              <optgroup label={t("filters.sections")}>
                {data.sections.map((x) => (
                  <option key={x.id} value={`s:${x.id}`}>
                    {x.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {data.teams.length > 0 ? (
              <optgroup label={t("filters.teams")}>
                {data.teams.map((x) => (
                  <option key={x.id} value={`t:${x.id}`}>
                    {x.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex min-h-11 items-center gap-2 text-secondary text-ink">
            <input
              type="checkbox"
              className="size-5 accent-(--club-fill)"
              checked={archived}
              onChange={(e) => setFilter({ archived: e.target.checked ? "1" : "" })}
            />
            {t("filters.archived")}
          </label>
          <div className="flex items-center gap-3">
            <span className="text-secondary text-muted" aria-live="polite">
              {t("count", { count: drills.length })}
            </span>
            {filtered ? (
              <Button
                size="sm"
                variant="tertiary"
                onClick={() => {
                  setQuery("");
                  setParams({}, { replace: true });
                }}
              >
                {t("filters.clear")}
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {drills.length === 0 ? (
        <EmptyState
          icon={<Icon.ClipboardText aria-hidden="true" />}
          title={filtered ? t("empty.filtered") : t("empty.title")}
          description={filtered ? undefined : t("empty.description")}
          action={
            !filtered && data.access.create ? (
              <ButtonLink to={paths.newDrill} action="add">
                {t("new")}
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {drills.map((drill) => (
            <li key={drill.id}>
              <DrillCard drill={drill} to={paths.drill(drill.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Contenidos del ámbito, agrupados por sección cuando hay más de una. */
function ContentSelect({
  data,
  value,
  onChange,
}: {
  data: DrillsResponse;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT("drills");
  const active = data.contents.filter((x) => x.status === "active" || x.id === value);
  const groups = data.sections
    .map((section) => ({ section, contents: active.filter((x) => x.sectionId === section.id) }))
    .filter((g) => g.contents.length > 0);
  return (
    <Select
      aria-label={t("filters.content")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{t("filters.allContents")}</option>
      {groups.length === 1
        ? groups[0]!.contents.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))
        : groups.map((g) => (
            <optgroup key={g.section.id} label={g.section.name}>
              {g.contents.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </optgroup>
          ))}
    </Select>
  );
}

/** Tarjeta de la tarea: la pizarra en pequeño, su ficha corta, contenidos, exigencias y uso. */
function DrillCard({ drill, to }: { drill: DrillSummary; to: string }) {
  const t = useT("drills");
  const s = useT("drillScopes");
  const b = useT("board");
  const intl = useIntl();
  const dates = useDates();
  const format = useLoadFormat();
  const whereOf = useDrillWhere();
  const meta = [
    drill.format,
    drill.space,
    drill.durationMin ? format.minutes(drill.durationMin) : null,
  ].filter(Boolean);
  const where = whereOf(drill);
  return (
    <Link
      to={to}
      className="flex h-full flex-col gap-3 rounded-card bg-surface p-4 text-ink no-underline shadow-card transition-shadow hover:shadow-float precisa:border precisa:border-border"
    >
      {drill.diagram ? (
        <DrillBoard diagram={drill.diagram} label={t("boardOf", { name: drill.name })} />
      ) : (
        <div className="grid aspect-[2/1] place-items-center rounded-field bg-raised text-secondary text-muted">
          {t("noBoard")}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-body font-semibold text-ink">{drill.name}</h2>
          {drill.status === "archived" ? (
            <StatusChip kind="neutral">{t("archived")}</StatusChip>
          ) : null}
          {drill.diagram?.animation ? (
            <StatusChip kind="club">
              {drill.audioUrl ? b("animatedVoice") : b("animated")}
            </StatusChip>
          ) : null}
        </div>
        <p className="text-secondary text-muted">
          {drill.scope === "club" || drill.scope === "personal"
            ? where
            : `${s(drill.scope)} · ${where}`}
        </p>
        {meta.length > 0 ? <p className="text-secondary text-ink">{meta.join(" · ")}</p> : null}
      </div>
      <ContentChips ids={drill.contents.map((x) => x.id)} contents={drill.contents} />
      <RestrictionTags tags={drill.restrictionTags} />
      <p className="mt-auto flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3 text-secondary text-muted">
        <span>{t("uses", { count: drill.uses })}</span>
        {drill.lastUsedOn ? (
          <span>{t("lastUsed", { date: dates.day(drill.lastUsedOn) })}</span>
        ) : null}
        {drill.rating !== null ? (
          <span>
            {t("ratingValue", {
              value: intl.formatNumber(drill.rating, { maximumFractionDigits: 1 }),
            })}
          </span>
        ) : null}
      </p>
    </Link>
  );
}
