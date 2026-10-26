import { addDays, type FitnessAthleteRow } from "@sportsmanager/shared";
import { useMemo, useState } from "react";
import { Figure, RestrictionChip, searchable } from "@/components/fitness/staff-ui";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useAthletes, useClassTime } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { useDates } from "@/lib/dates";
import {
  Alert,
  Avatar,
  DataList,
  EmptyState,
  Icon,
  Input,
  PageHeader,
  Segmented,
  StatusChip,
} from "@/ui";

type Filter = "all" | "noPlan" | "inactive";

/** Días sin venir a partir de los que un atleta cuenta como inactivo. */
const INACTIVE_DAYS = 14;

/**
 * Los atletas del box (ADR 0049): su tarifa y lo que le queda, cuándo vino por última vez, cuánto
 * viene y si tiene alguna restricción. Para encontrar a quien se está yendo antes de que se vaya.
 */
export function AthletesPage() {
  const t = useT("fitness.staff.athletes");
  const sub = useT("fitness.common.subscriptionStatus");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const time = useClassTime();
  const dates = useDates();
  const athletes = useAthletes();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const limit = addDays(time.today, -INACTIVE_DAYS);
  const inactive = (a: FitnessAthleteRow) => !a.lastVisit || a.lastVisit < limit;
  const noPlan = (a: FitnessAthleteRow) =>
    !a.plan || a.plan.status === "cancelled" || a.plan.status === "expired";

  const all = useMemo(() => athletes.data?.athletes ?? [], [athletes.data]);
  const q = searchable(query.trim());
  const rows = all
    .filter((a) => filter === "all" || (filter === "noPlan" ? noPlan(a) : inactive(a)))
    .filter((a) => !q || searchable(`${a.name} ${a.email ?? ""}`).includes(q));

  const planCell = (a: FitnessAthleteRow) =>
    !a.plan ? (
      <StatusChip kind="warning">{t("noPlanChip")}</StatusChip>
    ) : (
      <span className="flex flex-col">
        <span className="text-ink">{a.plan.name}</span>
        <span className="text-secondary text-muted">
          {a.plan.status !== "active"
            ? sub(a.plan.status)
            : a.plan.remaining !== null
              ? t("remaining", { count: a.plan.remaining })
              : a.plan.expiresOn
                ? t("until", { date: dates.day(a.plan.expiresOn) })
                : t("unlimited")}
        </span>
      </span>
    );
  const lastVisit = (a: FitnessAthleteRow) => (a.lastVisit ? dates.day(a.lastVisit) : t("never"));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />

      {athletes.data ? (
        <div className="grid grid-cols-3 gap-3">
          <Figure value={all.length} label={t("stats.total")} />
          <Figure value={all.filter(noPlan).length} label={t("stats.noPlan")} />
          <Figure value={all.filter(inactive).length} label={t("stats.inactive")} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex w-full max-w-sm flex-col gap-1.5">
          <span className="text-secondary font-medium text-ink">{t("search")}</span>
          <Input
            type="search"
            value={query}
            placeholder={t("searchPlaceholder")}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Segmented<Filter>
          label={t("filter")}
          value={filter}
          onChange={setFilter}
          options={[
            { key: "all", label: t("all") },
            { key: "noPlan", label: t("noPlan") },
            { key: "inactive", label: t("inactive") },
          ]}
        />
      </div>

      {athletes.isError ? (
        <Alert kind="error">{t("loadError")}</Alert>
      ) : athletes.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <div className="h-16 animate-pulse rounded-card bg-raised" />
          <div className="h-16 animate-pulse rounded-card bg-raised" />
          <div className="h-16 animate-pulse rounded-card bg-raised" />
        </div>
      ) : (
        <DataList<FitnessAthleteRow>
          caption={t("caption")}
          rows={rows}
          getKey={(a) => a.playerId}
          href={(a) => paths.athleteFile(a.playerId)}
          empty={
            <EmptyState
              icon={<Icon.UsersThree size={28} weight="duotone" aria-hidden="true" />}
              title={all.length === 0 ? t("empty") : t("emptyFilter")}
            />
          }
          columns={[
            {
              key: "name",
              header: t("columns.athlete"),
              cell: (a) => (
                <span className="flex items-center gap-3">
                  <Avatar name={a.name} src={a.photoUrl} size="sm" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-ink">{a.name}</span>
                    {a.email ? (
                      <span className="truncate text-secondary text-muted">{a.email}</span>
                    ) : null}
                  </span>
                </span>
              ),
            },
            { key: "plan", header: t("columns.plan"), cell: planCell },
            {
              key: "last",
              header: t("columns.lastVisit"),
              cell: (a) => (
                <span className={inactive(a) ? "text-warning" : "text-ink"}>{lastVisit(a)}</span>
              ),
            },
            { key: "visits", header: t("columns.visits"), numeric: true, cell: (a) => a.visits30 },
            {
              key: "app",
              header: t("columns.app"),
              cell: (a) => (
                <StatusChip kind={a.hasAccess ? "success" : "neutral"}>
                  {a.hasAccess ? t("hasApp") : t("noApp")}
                </StatusChip>
              ),
            },
            {
              key: "restriction",
              header: t("columns.restriction"),
              cell: (a) => (a.restriction ? <RestrictionChip status={a.restriction} /> : null),
            },
          ]}
          mobileRow={(a) => ({
            leading: <Avatar name={a.name} src={a.photoUrl} size="sm" />,
            title: a.name,
            subtitle: `${a.plan ? a.plan.name : t("noPlanChip")} · ${lastVisit(a)}`,
            trailing: a.restriction ? <RestrictionChip status={a.restriction} /> : null,
          })}
        />
      )}
    </div>
  );
}
