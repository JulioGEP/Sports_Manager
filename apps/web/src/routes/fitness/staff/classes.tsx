import { addDays } from "@sportsmanager/shared";
import { useState } from "react";
import { ClassRow, DayStrip } from "@/components/fitness/class-row";
import { useHas } from "@/components/fitness/staff-ui";
import { clubPaths, useReadyClub } from "@/lib/club";
import { dayRange, daysFrom, useClasses, useClassTime, useFitnessRole } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  Segmented,
  StatusChip,
} from "@/ui";

type Scope = "mine" | "all";

/**
 * Las clases del box para el personal (ADR 0049): un día cada vez, las del coach o todas, con
 * sus reservas, la espera y el check-in. Cada fila abre la clase para pasar lista.
 */
export function StaffClassesPage() {
  const t = useT("fitness.staff.classes");
  const s = useT("fitness.staff");
  const c = useT("fitness.common");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const has = useHas();
  const role = useFitnessRole();
  const time = useClassTime();
  const [day, setDay] = useState(time.today);
  // El coach empieza por lo suyo; el dueño, por todo el box.
  const [scope, setScope] = useState<Scope>(role === "coach" ? "mine" : "all");
  const classes = useClasses(dayRange(time.timezone, day), { mine: scope === "mine" });
  const list = classes.data?.classes ?? [];
  const booked = list.reduce((sum, x) => sum + x.booked, 0);
  const now = Date.now();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          has("org.structure.write") ? (
            <ButtonLink action="edit" to={paths.classTypes} variant="secondary">
              {t("setup")}
            </ButtonLink>
          ) : null
        }
      />
      <div className="flex flex-col gap-3">
        <DayStrip
          days={daysFrom(addDays(time.today, -1), 8)}
          selected={day}
          onSelect={setDay}
          label={t("days")}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented<Scope>
            label={t("scope")}
            value={scope}
            onChange={setScope}
            options={[
              { key: "mine", label: t("mine") },
              { key: "all", label: t("all") },
            ]}
          />
          {classes.data ? (
            <span className="text-secondary text-muted">
              {t("summary", { classes: list.length, booked })}
            </span>
          ) : null}
        </div>
      </div>

      <Card padded={false} title={time.day(day)}>
        {classes.isError ? (
          <div className="px-5 pb-5">
            <Alert
              kind="error"
              actions={
                <Button variant="secondary" size="sm" onClick={() => void classes.refetch()}>
                  {c("retry")}
                </Button>
              }
            >
              {s("loadError")}
            </Alert>
          </div>
        ) : classes.isPending ? (
          <div className="mx-5 mb-5 flex flex-col gap-2" aria-busy="true" aria-label={c("loading")}>
            <div className="h-16 animate-pulse rounded-card bg-raised" />
            <div className="h-16 animate-pulse rounded-card bg-raised" />
          </div>
        ) : list.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={<Icon.CalendarBlank size={28} weight="duotone" aria-hidden="true" />}
              title={scope === "mine" ? t("emptyMine") : t("empty")}
              action={
                scope === "mine" ? (
                  <Button variant="secondary" size="sm" onClick={() => setScope("all")}>
                    {t("seeAll")}
                  </Button>
                ) : has("org.structure.write") ? (
                  <ButtonLink action="edit" to={paths.classTypes} variant="secondary" size="sm">
                    {t("setup")}
                  </ButtonLink>
                ) : null
              }
            />
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {list.map((cls) => (
              <ClassRow
                key={cls.id}
                cls={cls}
                to={paths.classDetail(cls.id)}
                showMine={false}
                trailing={
                  Date.parse(cls.startsAt) <= now && cls.booked > 0 ? (
                    <StatusChip kind={cls.checkedIn >= cls.booked ? "success" : "neutral"}>
                      {s("checkins", { checkedIn: cls.checkedIn, booked: cls.booked })}
                    </StatusChip>
                  ) : null
                }
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
