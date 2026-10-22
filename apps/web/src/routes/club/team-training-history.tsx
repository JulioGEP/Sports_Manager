import { TeamSessionsResponseSchema, type TeamSessionsResponse } from "@sportsmanager/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router";
import { ContentChips, useLoadFormat } from "@/components/training-ui";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import { downloadXlsx, type Sheet } from "@/lib/xlsx";
import {
  Alert,
  Button,
  Card,
  DataList,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  Stat,
  StatusChip,
} from "@/ui";
import { sessionStatusKind } from "./team-training";

type Row = TeamSessionsResponse["sessions"][number];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Histórico de sesiones de un equipo (Bloque 21): qué se hizo, cuánto duró y cuánto cargó, con el
 * reparto de minutos por contenido. Se filtra por contenido y fechas y se baja a Excel.
 */
export function TeamTrainingHistoryPage() {
  const t = useT("training.history");
  const tt = useT("training");
  const st = useT("sessionStatus");
  const kinds = useT("contentKinds");
  const c = useT("common");
  const errors = useT("errors");
  const { id = "" } = useParams();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const dates = useDates();
  const fmt = useLoadFormat();
  const [params, setParams] = useSearchParams();
  const content = params.get("content") ?? "";
  const from = DATE.test(params.get("from") ?? "") ? params.get("from")! : "";
  const to = DATE.test(params.get("to") ?? "") ? params.get("to")! : "";
  const setFilter = (key: "content" | "from" | "to", value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const query = new URLSearchParams();
  if (content) query.set("content", content);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const qs = query.toString();

  const history = useQuery({
    queryKey: ["org", slug, "team", id, "training", "history", qs],
    queryFn: () =>
      apiFetch(`/api/org/teams/${id}/training/sessions${qs ? `?${qs}` : ""}`, {
        schema: TeamSessionsResponseSchema,
      }),
    placeholderData: keepPreviousData,
    retry: false,
  });

  if (history.isError) {
    const notFound = history.error instanceof ApiClientError && history.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(history.error))}</Alert>
    );
  }
  if (!history.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  const { team, sessions, contents } = history.data;
  const done = sessions.filter((s) => s.status === "done");
  const minutes = done.reduce((a, s) => a + (s.actualMinutes ?? s.plannedMinutes), 0);
  const loads = done.map((s) => s.actualLoad).filter((v): v is number => v !== null);
  const meanLoad = loads.length > 0 ? loads.reduce((a, b) => a + b, 0) / loads.length : null;
  const byContent = new Map<string, number>();
  for (const s of sessions.filter((x) => x.status !== "cancelled"))
    for (const cm of s.contentMinutes)
      byContent.set(cm.contentId, (byContent.get(cm.contentId) ?? 0) + cm.minutes);
  const ranking = [...byContent.entries()]
    .map(([contentId, total]) => ({ content: contents.find((ct) => ct.id === contentId), total }))
    .filter((r): r is { content: (typeof contents)[number]; total: number } => !!r.content)
    .sort((a, b) => b.total - a.total);
  const top = ranking[0]?.total ?? 1;

  function exportExcel() {
    const contentNames = (s: Row) =>
      s.contentMinutes
        .map((cm) => contents.find((ct) => ct.id === cm.contentId)?.name)
        .filter(Boolean)
        .join(", ");
    const sheets: Sheet[] = [
      {
        name: t("export.sessions"),
        rows: [
          [
            t("table.date"),
            t("table.md"),
            t("table.status"),
            t("table.objective"),
            t("export.plannedMinutes"),
            t("export.actualMinutes"),
            t("export.plannedLoad"),
            t("export.actualLoad"),
            t("export.drills"),
            t("table.contents"),
          ],
          ...sessions.map((s) => [
            s.date,
            s.mdLabel,
            st(s.status),
            s.objective ?? s.title,
            s.plannedMinutes,
            s.actualMinutes,
            Math.round(s.plannedLoad),
            s.actualLoad === null ? null : Math.round(s.actualLoad),
            s.drills.join(", "),
            contentNames(s),
          ]),
        ],
      },
      {
        name: t("export.contents"),
        rows: [
          [t("export.content"), t("export.kind"), t("export.minutes")],
          ...ranking.map((r) => [r.content.name, kinds(r.content.kind), r.total]),
        ],
      },
    ];
    downloadXlsx(`${team.name} - ${t("export.file")}`, sheets);
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={paths.teamTraining(id)}
        backLabel={tt("backToWeek")}
        eyebrow={team.name}
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            variant="secondary"
            icon={<Icon.DownloadSimple size={18} aria-hidden="true" />}
            onClick={exportExcel}
            disabled={sessions.length === 0}
          >
            {t("export.button")}
          </Button>
        }
      />

      <Card>
        <div className="grid gap-4 pt-5 sm:grid-cols-3">
          <Field label={t("filters.content")}>
            {(fid) => (
              <Select
                id={fid}
                value={content}
                onChange={(e) => setFilter("content", e.target.value)}
              >
                <option value="">{t("filters.allContents")}</option>
                {contents
                  .filter((ct) => ct.status === "active" || ct.id === content)
                  .map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {`${ct.name} · ${kinds(ct.kind)}`}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label={t("filters.from")} hint={from ? undefined : t("filters.fromHint")}>
            {(fid, describedBy) => (
              <Input
                id={fid}
                type="date"
                aria-describedby={describedBy}
                value={from}
                max={to || undefined}
                onChange={(e) => setFilter("from", e.target.value)}
              />
            )}
          </Field>
          <Field label={t("filters.to")}>
            {(fid) => (
              <Input
                id={fid}
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setFilter("to", e.target.value)}
              />
            )}
          </Field>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          icon={<Icon.CheckCircle />}
          value={done.length}
          label={t("stats.done", { count: done.length })}
        />
        <Stat icon={<Icon.Clock />} value={fmt.minutes(minutes)} label={t("stats.minutes")} />
        <Stat icon={<Icon.Pulse />} value={fmt.load(meanLoad)} label={t("stats.meanLoad")} />
      </div>

      {ranking.length > 0 ? (
        <Card title={t("byContent")} description={t("byContentHint")}>
          <ul className="flex flex-col gap-2">
            {ranking.slice(0, 10).map((r) => (
              <li
                key={r.content.id}
                className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3"
              >
                <button
                  type="button"
                  onClick={() => setFilter("content", r.content.id)}
                  className="truncate text-left text-secondary font-medium text-ink hover:underline"
                >
                  {r.content.name}
                </button>
                <span className="h-2.5 rounded-full bg-raised" aria-hidden="true">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.max(3, (r.total / top) * 100)}%`,
                      background: "var(--club-fill)",
                    }}
                  />
                </span>
                <span className="font-mono text-secondary text-ink">{fmt.minutes(r.total)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card
        title={t("list")}
        description={t("listCount", { count: sessions.length })}
        padded={false}
      >
        <DataList<Row>
          caption={t("list")}
          rows={sessions}
          getKey={(s) => s.id}
          empty={
            <EmptyState
              icon={<Icon.SportIcons.Silbato />}
              title={t("empty")}
              description={content || from || to ? t("emptyFiltered") : t("emptyHint")}
            />
          }
          href={(s) => paths.session(s.id)}
          columns={[
            {
              key: "date",
              header: t("table.date"),
              cell: (s) => (
                <span className="flex items-center gap-2">
                  {dates.day(s.date)}
                  {s.mdLabel ? (
                    <span className="rounded-chip bg-raised px-1.5 font-mono text-label font-semibold text-ink">
                      {s.mdLabel}
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              key: "objective",
              header: t("table.objective"),
              cell: (s) => (
                <span className="flex min-w-0 flex-col gap-1">
                  <Link to={paths.session(s.id)} className="font-medium text-ink">
                    {s.objective ?? s.title}
                  </Link>
                  <ContentChips
                    ids={s.contentMinutes.map((cm) => cm.contentId)}
                    contents={contents}
                  />
                </span>
              ),
            },
            {
              key: "status",
              header: t("table.status"),
              cell: (s) => (
                <StatusChip kind={sessionStatusKind[s.status]}>{st(s.status)}</StatusChip>
              ),
            },
            {
              key: "minutes",
              header: t("table.minutes"),
              numeric: true,
              cell: (s) => s.actualMinutes ?? s.plannedMinutes,
            },
            {
              key: "load",
              header: t("table.load"),
              numeric: true,
              cell: (s) => fmt.load(s.actualLoad ?? (s.plannedLoad > 0 ? s.plannedLoad : null)),
            },
          ]}
          mobileRow={(s) => ({
            leading: (
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-club-soft font-mono text-label font-semibold text-club-soft-text">
                {s.mdLabel ?? "—"}
              </span>
            ),
            title: <Link to={paths.session(s.id)}>{s.objective ?? s.title}</Link>,
            subtitle: [
              dates.day(s.date),
              fmt.minutes(s.actualMinutes ?? s.plannedMinutes),
              s.actualLoad !== null ? fmt.load(s.actualLoad) : null,
            ]
              .filter(Boolean)
              .join(" · "),
            trailing: <StatusChip kind={sessionStatusKind[s.status]}>{st(s.status)}</StatusChip>,
          })}
        />
      </Card>
    </div>
  );
}
