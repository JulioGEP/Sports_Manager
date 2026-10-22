import {
  InfirmaryResponseSchema,
  type AvailabilityStatus,
  type InfirmaryResponse,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { AvailabilityChip } from "@/components/training-ui";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import {
  Alert,
  Avatar,
  Card,
  DataList,
  EmptyState,
  Icon,
  PageHeader,
  Stat,
  StatusChip,
} from "@/ui";

type Row = InfirmaryResponse["players"][number];

/** Orden de los grupos: primero quien no puede entrenar, luego readaptación y limitados. */
const GROUPS: Exclude<AvailabilityStatus, "available">[] = ["out", "rehab", "limited"];

/**
 * Enfermería (ADR 0039): bajas, readaptaciones y limitados del ámbito de quien mira, con la vuelta
 * prevista y las molestias que los jugadores han reportado en el bienestar. La lesión (zona, tipo,
 * diagnóstico y fase) solo llega a quien tiene acceso a Salud; el resto ve la disponibilidad.
 */
export function InfirmaryPage() {
  const t = useT("infirmary");
  const a = useT("availability");
  const b = useT("bodyAreas");
  const k = useT("injuryKinds");
  const c = useT("common");
  const errors = useT("errors");
  const dates = useDates();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);

  const query = useQuery({
    queryKey: ["org", slug, "infirmary"],
    queryFn: () => apiFetch("/api/org/infirmary", { schema: InfirmaryResponseSchema }),
    retry: false,
  });

  if (query.isError) {
    const status = query.error instanceof ApiClientError ? query.error.status : 0;
    return (
      <Alert kind="error">
        {status === 404
          ? errors("not_found")
          : status === 403
            ? errors("forbidden")
            : errors(errorKey(query.error))}
      </Alert>
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
  const { players, soreness, access } = query.data;
  const returning = players.filter((p) => p.returningThisWeek).length;
  const count = (status: AvailabilityStatus) =>
    players.filter((p) => p.availability.status === status).length;
  const injuryText = (p: Row) =>
    p.injury ? `${b(p.injury.bodyArea)} · ${k(p.injury.kind)}` : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={paths.training}
        backLabel={t("back")}
        title={t("title")}
        description={access.healthRead ? t("descriptionHealth") : t("description")}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<Icon.Lifebuoy weight="duotone" />}
          value={count("out")}
          label={a("status.out")}
        />
        <Stat
          icon={<Icon.PersonSimpleRun weight="duotone" />}
          value={count("rehab")}
          label={a("status.rehab")}
        />
        <Stat
          icon={<Icon.Warning weight="duotone" />}
          value={count("limited")}
          label={a("status.limited")}
        />
        <Stat
          icon={<Icon.CalendarBlank weight="duotone" />}
          value={returning}
          label={t("returningThisWeek")}
        />
      </div>

      {players.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon.CheckCircle weight="duotone" />}
            title={t("empty.title")}
            description={t("empty.description")}
          />
        </Card>
      ) : (
        GROUPS.map((status) => {
          const rows = players
            .filter((p) => p.availability.status === status)
            .sort(
              (x, y) =>
                (x.availability.expectedReturnOn ?? "9999").localeCompare(
                  y.availability.expectedReturnOn ?? "9999",
                ) || x.name.localeCompare(y.name),
            );
          if (rows.length === 0) return null;
          return (
            <Card
              key={status}
              title={`${a(`status.${status}`)} (${rows.length})`}
              description={t(`groups.${status}`)}
              padded={false}
            >
              <DataList<Row>
                caption={a(`status.${status}`)}
                rows={rows}
                getKey={(p) => p.playerId}
                href={(p) => paths.playerPerformance(p.playerId)}
                empty={null}
                columns={[
                  {
                    key: "player",
                    header: t("table.player"),
                    cell: (p) => (
                      <span className="flex items-center gap-3">
                        <Avatar name={p.name} src={p.photoUrl} size="sm" />
                        <span className="flex min-w-0 flex-col">
                          <Link
                            to={paths.playerPerformance(p.playerId)}
                            className="font-medium text-ink no-underline"
                          >
                            {p.name}
                          </Link>
                          <span className="text-secondary text-muted">{p.team?.name ?? "—"}</span>
                        </span>
                      </span>
                    ),
                  },
                  {
                    key: "status",
                    header: t("table.status"),
                    cell: (p) => <AvailabilityChip value={p.availability} />,
                  },
                  ...(access.healthRead
                    ? [
                        {
                          key: "injury",
                          header: t("table.injury"),
                          cell: (p: Row) => <InjuryLine row={p} />,
                        },
                      ]
                    : []),
                  {
                    key: "return",
                    header: t("table.return"),
                    cell: (p) => <ReturnLine row={p} />,
                  },
                ]}
                mobileRow={(p) => ({
                  leading: <Avatar name={p.name} src={p.photoUrl} size="sm" />,
                  title: <Link to={paths.playerPerformance(p.playerId)}>{p.name}</Link>,
                  subtitle: [
                    p.team?.name,
                    access.healthRead ? injuryText(p) : null,
                    p.availability.expectedReturnOn
                      ? t("returnOn", { date: dates.day(p.availability.expectedReturnOn) })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                  trailing: p.returningThisWeek ? (
                    <StatusChip kind="success">{t("thisWeek")}</StatusChip>
                  ) : undefined,
                })}
              />
            </Card>
          );
        })
      )}

      {soreness.length > 0 ? (
        <Card title={t("soreness.title")} description={t("soreness.description")} padded={false}>
          <DataList<InfirmaryResponse["soreness"][number]>
            caption={t("soreness.title")}
            rows={[...soreness].sort((x, y) => x.soreness - y.soreness)}
            getKey={(s) => `${s.playerId}-${s.date}`}
            href={(s) => paths.playerPerformance(s.playerId)}
            empty={null}
            columns={[
              {
                key: "name",
                header: t("table.player"),
                cell: (s) => (
                  <Link
                    to={paths.playerPerformance(s.playerId)}
                    className="font-medium text-ink no-underline"
                  >
                    {s.name}
                  </Link>
                ),
              },
              { key: "date", header: t("soreness.date"), cell: (s) => dates.day(s.date) },
              {
                key: "value",
                header: t("soreness.value"),
                cell: (s) => (
                  <StatusChip kind={s.soreness <= 1 ? "danger" : "warning"}>
                    {t("soreness.score", { value: s.soreness })}
                  </StatusChip>
                ),
              },
              {
                key: "area",
                header: t("soreness.area"),
                cell: (s) => s.sorenessArea ?? "—",
              },
            ]}
            mobileRow={(s) => ({
              title: <Link to={paths.playerPerformance(s.playerId)}>{s.name}</Link>,
              subtitle: [dates.day(s.date), s.sorenessArea].filter(Boolean).join(" · "),
              trailing: (
                <StatusChip kind={s.soreness <= 1 ? "danger" : "warning"}>
                  {t("soreness.score", { value: s.soreness })}
                </StatusChip>
              ),
            })}
          />
        </Card>
      ) : null}

      {!access.healthRead ? <p className="text-secondary text-muted">{t("healthHidden")}</p> : null}
    </div>
  );
}

/** Zona y tipo de la lesión abierta, el diagnóstico y la fase en curso de la readaptación. */
function InjuryLine({ row }: { row: Row }) {
  const t = useT("infirmary");
  const b = useT("bodyAreas");
  const k = useT("injuryKinds");
  if (!row.injury) return <span className="text-secondary text-muted">—</span>;
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-ink">
        {b(row.injury.bodyArea)} · {k(row.injury.kind)}
      </span>
      {row.injury.diagnosis ? (
        <span className="text-secondary text-muted">{row.injury.diagnosis}</span>
      ) : null}
      {row.injury.phase ? (
        <span className="text-secondary text-muted">{t("phase", { phase: row.injury.phase })}</span>
      ) : null}
    </span>
  );
}

function ReturnLine({ row }: { row: Row }) {
  const t = useT("infirmary");
  const dates = useDates();
  const { expectedReturnOn, fromOn, note } = row.availability;
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex flex-wrap items-center gap-2 text-ink">
        {expectedReturnOn ? dates.day(expectedReturnOn) : t("noReturn")}
        {row.returningThisWeek ? <StatusChip kind="success">{t("thisWeek")}</StatusChip> : null}
      </span>
      {fromOn ? (
        <span className="text-secondary text-muted">{t("since", { date: dates.day(fromOn) })}</span>
      ) : null}
      {note ? <span className="text-secondary text-muted">{note}</span> : null}
    </span>
  );
}
