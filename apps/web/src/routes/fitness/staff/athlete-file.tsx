import { benchmarkByCode, type Subscription } from "@sportsmanager/shared";
import { useParams } from "react-router";
import { ClassRow } from "@/components/fitness/class-row";
import { Figure, RestrictionChip, useHas } from "@/components/fitness/staff-ui";
import { useMovementName } from "@/components/fitness/workout-blocks";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useAthleteDetail, useKg } from "@/lib/fitness";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import {
  Alert,
  Avatar,
  ButtonLink,
  Card,
  Definitions,
  EmptyState,
  Icon,
  PageHeader,
  StatusChip,
} from "@/ui";

/**
 * La ficha de un atleta para el box (ADR 0049): cómo contactarle, su tarifa y lo que le queda,
 * sus clases, sus marcas y benchmarks y, solo si él lo comparte, sus medidas. Desde aquí se le
 * escribe o se abre su ficha completa del club.
 */
export function AthleteFilePage() {
  const { id } = useParams();
  const t = useT("fitness.staff.file");
  const c = useT("fitness.common");
  const nav = useT("fitness.common.nav");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const has = useHas();
  const dates = useDates();
  const kg = useKg();
  const movementName = useMovementName();
  const detail = useAthleteDetail(id);

  if (detail.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader backTo={paths.athletes} backLabel={nav("athletes")} title={nav("athletes")} />
        <Alert kind="error">{t("notFound")}</Alert>
      </div>
    );
  }
  if (!detail.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-32 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }

  const { athlete, plans, bookings, movements, benchmarks, body, streak } = detail.data;
  const now = Date.now();
  const upcoming = bookings.filter((b) => Date.parse(b.endsAt) > now);
  const recent = bookings.filter((b) => Date.parse(b.endsAt) <= now).slice(0, 10);
  const age = dates.age(athlete.birthDate);
  const latestBody = body?.[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backTo={paths.athletes}
        backLabel={nav("athletes")}
        title={
          <>
            <Avatar name={athlete.name} src={athlete.photoUrl} size="lg" />
            {athlete.name}
          </>
        }
        description={[
          age !== null ? t("age", { age }) : null,
          athlete.joinedOn ? t("since", { date: dates.day(athlete.joinedOn) }) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {athlete.adult && has("org.community.write") ? (
              <ButtonLink action="send" to={paths.messageThread(athlete.playerId)}>
                {t("write")}
              </ButtonLink>
            ) : null}
            {has("org.players.read") ? (
              <ButtonLink action="open" to={paths.player(athlete.playerId)} variant="secondary">
                {t("fullFile")}
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {athlete.restriction ? (
        <Alert
          kind={athlete.restriction === "out" ? "error" : "warning"}
          title={t("restrictionTitle")}
        >
          <RestrictionChip status={athlete.restriction} />
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure value={streak.current} label={t("streak")} />
        <Figure value={streak.best} label={t("bestStreak")} />
        <Figure value={athlete.visits30} label={t("visits30")} />
        <Figure
          value={athlete.lastVisit ? dates.day(athlete.lastVisit) : t("never")}
          label={t("lastVisit")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("contact")}>
          <Definitions
            items={[
              {
                term: t("email"),
                detail: athlete.email ? (
                  <a href={`mailto:${athlete.email}`} className="text-club-text">
                    {athlete.email}
                  </a>
                ) : (
                  t("none")
                ),
              },
              {
                term: t("phone"),
                detail: athlete.phone ? (
                  <a href={`tel:${athlete.phone.replace(/\s+/g, "")}`} className="text-club-text">
                    {athlete.phone}
                  </a>
                ) : (
                  t("none")
                ),
              },
              {
                term: t("account"),
                detail: (
                  <StatusChip kind={athlete.hasAccess ? "success" : "neutral"}>
                    {athlete.hasAccess ? t("hasApp") : t("noApp")}
                  </StatusChip>
                ),
              },
            ]}
          />
        </Card>

        <Card title={t("plans.title")}>
          {plans.length === 0 ? (
            <p className="text-secondary text-muted">{t("plans.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {plans.map((p) => (
                <PlanLine key={p.id} plan={p} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card padded={false} title={t("bookings.upcoming")}>
          {upcoming.length === 0 ? (
            <p className="px-5 pb-5 text-secondary text-muted">{t("bookings.empty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {upcoming.map((b) => (
                <ClassRow key={b.id} cls={b} to={paths.classDetail(b.id)} />
              ))}
            </ul>
          )}
        </Card>
        <Card padded={false} title={t("bookings.recent")}>
          {recent.length === 0 ? (
            <p className="px-5 pb-5 text-secondary text-muted">{t("bookings.emptyRecent")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {recent.map((b) => (
                <ClassRow key={b.id} cls={b} to={paths.classDetail(b.id)} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("records.title")}>
          {movements.length === 0 ? (
            <EmptyState
              icon={<Icon.Barbell size={28} weight="duotone" aria-hidden="true" />}
              title={t("records.empty")}
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {movements.map((m) => (
                <li key={m.movementCode} className="flex flex-col gap-1 py-2">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">{movementName(m.movementCode)}</span>
                    {m.oneRm ? (
                      <span className="font-mono font-semibold text-ink">
                        1RM {kg(m.oneRm.kg)}
                        {m.oneRm.estimated ? ` (${t("records.estimated")})` : ""}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap gap-2 text-secondary text-muted">
                    {m.best.map((r) => (
                      <span key={r.id} className="font-mono">
                        {t("records.best", { reps: r.reps, kg: kg(r.loadKg) })}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t("benchmarks.title")}>
          {benchmarks.length === 0 ? (
            <EmptyState
              icon={<Icon.Medal size={28} weight="duotone" aria-hidden="true" />}
              title={t("benchmarks.empty")}
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {benchmarks.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-ink">
                      {benchmarkByCode(b.benchmarkCode)?.name ?? b.benchmarkCode}
                    </span>
                    <span className="text-secondary text-muted">{dates.day(b.onDate)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {b.isBest ? <StatusChip kind="club">{t("benchmarks.best")}</StatusChip> : null}
                    <span className="font-mono font-semibold text-ink">{b.display}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={t("body.title")}>
        {body === null ? (
          <p className="text-secondary text-muted">{t("body.private")}</p>
        ) : !latestBody ? (
          <p className="text-secondary text-muted">{t("body.empty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-secondary text-muted">
              {t("body.date", { date: dates.day(latestBody.onDate) })}
            </span>
            <Definitions
              items={[
                latestBody.weightKg !== null
                  ? { term: t("body.weight"), detail: kg(latestBody.weightKg) }
                  : null,
                latestBody.bodyFatPct !== null
                  ? { term: t("body.fat"), detail: `${latestBody.bodyFatPct} %` }
                  : null,
                latestBody.waistCm !== null
                  ? { term: t("body.waist"), detail: `${latestBody.waistCm} cm` }
                  : null,
                latestBody.hipCm !== null
                  ? { term: t("body.hip"), detail: `${latestBody.hipCm} cm` }
                  : null,
              ].filter((x): x is { term: string; detail: string } => x !== null)}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

/** Una tarifa con su estado y lo que le queda. */
function PlanLine({ plan }: { plan: Subscription }) {
  const ent = useT("fitness.common.entitlements");
  const usage = useT("fitness.common.usage");
  const status = useT("fitness.common.subscriptionStatus");
  const dates = useDates();
  const sessions = plan.plan.sessions ?? 0;
  const entitlement =
    plan.plan.entitlement === "unlimited" || plan.plan.entitlement === "none"
      ? ent(plan.plan.entitlement)
      : ent(plan.plan.entitlement, { count: sessions });
  return (
    <li className="flex flex-col gap-1 rounded-field bg-raised p-3">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-ink">{plan.plan.name}</span>
        <StatusChip
          kind={
            plan.status === "active" ? "success" : plan.status === "paused" ? "warning" : "neutral"
          }
        >
          {status(plan.status)}
        </StatusChip>
      </span>
      <span className="text-secondary text-muted">{entitlement}</span>
      {plan.status === "active" ? (
        <span className="text-secondary text-ink">
          {plan.usage.limit === null
            ? usage("unlimited")
            : usage("remaining", { remaining: plan.usage.remaining ?? 0, limit: plan.usage.limit })}
          {plan.expiresOn ? ` · ${usage("until", { date: dates.day(plan.expiresOn) })}` : ""}
        </span>
      ) : null}
    </li>
  );
}
