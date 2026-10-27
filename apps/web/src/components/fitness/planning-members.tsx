import type {
  PlanMember,
  PlanningCandidatesResponse,
  PlanSummary,
  ProgrammingFeeStatus,
} from "@sportsmanager/shared";
import { useId, useMemo, useState, type ReactNode } from "react";
import { useT } from "@/lib/intl";
import { useLevelName } from "@/lib/planning";
import { Alert, Avatar, Button, Field, Icon, Input, StatusChip, type StatusKind } from "@/ui";

/**
 * Los atletas de un plan propio (ADR 0054): quién está, su nivel, si paga la cuota de programación
 * (solo si el box tiene una) y quién sigue ya otro plan propio. Nadie sigue dos a la vez: antes de
 * entrar, se decide si se le anula el suyo o se queda fuera.
 */

export type PlanCandidate = PlanningCandidatesResponse["athletes"][number];

const FEE_TONE: Record<ProgrammingFeeStatus, StatusKind> = {
  paid: "success",
  pending: "warning",
  overdue: "danger",
  none: "neutral",
};

/** La cuota de programación de un atleta: nada si el box no tiene cuota de programación. */
export function FeeChip({ fee }: { fee: ProgrammingFeeStatus | null }) {
  const t = useT("fitness.planning.members.fee");
  if (!fee) return null;
  return <StatusChip kind={FEE_TONE[fee]}>{t(fee)}</StatusChip>;
}

/** Cuántos pagan la cuota de programación, cuántos la deben y cuántos no la tienen. */
export function FeeSummary({ people }: { people: readonly Pick<PlanMember, "fee">[] }) {
  const t = useT("fitness.planning.members");
  const count = (fee: ProgrammingFeeStatus) => people.filter((p) => p.fee === fee).length;
  const parts = (["paid", "pending", "overdue", "none"] as const)
    .map((fee) => ({ fee, n: count(fee) }))
    .filter((x) => x.n > 0);
  if (parts.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-secondary text-muted">
      <span className="font-medium text-ink">{t("feeTitle")}</span>
      {parts.map((x) => (
        <StatusChip key={x.fee} kind={FEE_TONE[x.fee]}>
          {t(`feeCount.${x.fee}`, { count: x.n })}
        </StatusChip>
      ))}
    </p>
  );
}

/** Una fila de atleta: foto, nombre, nivel, cuota y su plan propio, si lo tiene. */
export function MemberRow({
  person,
  plan,
  moving,
  action,
}: {
  person: PlanMember;
  /** El plan propio que ya sigue, si lo tiene. */
  plan?: { name: string } | null | undefined;
  /** Pasa a este plan y se le anula el suyo. */
  moving?: boolean | undefined;
  action?: ReactNode;
}) {
  const t = useT("fitness.planning.members");
  const levelName = useLevelName();
  return (
    <li className="flex min-h-16 items-center gap-3 py-2">
      <Avatar name={person.name} src={person.photoUrl} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium text-ink">{person.name}</span>
        <span className="flex flex-wrap gap-1.5">
          {person.level ? <StatusChip kind="neutral">{levelName(person.level)}</StatusChip> : null}
          <FeeChip fee={person.fee} />
          {plan ? (
            <StatusChip kind={moving ? "info" : "warning"}>
              {moving ? t("leaves", { plan: plan.name }) : t("follows", { plan: plan.name })}
            </StatusChip>
          ) : null}
        </span>
      </span>
      {action}
    </li>
  );
}

/**
 * Elegir los atletas de un plan: la lista con su nivel y su cuota, quitar a cualquiera, añadir
 * buscando por nombre y resolver los que ya siguen otro plan propio (anular el suyo o dejarlos
 * fuera). Con `single`, una sola persona.
 */
export function PlanMembersEditor({
  candidates,
  members,
  replace,
  onChange,
  single = false,
}: {
  candidates: readonly PlanCandidate[];
  members: readonly string[];
  replace: readonly string[];
  onChange: (members: string[], replace: string[]) => void;
  single?: boolean;
}) {
  const t = useT("fitness.planning.members");
  const levelName = useLevelName();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(candidates.map((c) => [c.playerId, c])), [candidates]);
  const chosen = members.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const conflicts = chosen.filter((c) => c.plan && !replace.includes(c.playerId));
  const needle = query.trim().toLocaleLowerCase();
  const results = needle
    ? candidates
        .filter((c) => !members.includes(c.playerId))
        .filter((c) => c.name.toLocaleLowerCase().includes(needle))
        .slice(0, 8)
    : [];

  const remove = (ids: string[]) =>
    onChange(
      members.filter((m) => !ids.includes(m)),
      replace.filter((r) => !ids.includes(r)),
    );
  const cancelTheirs = (ids: string[]) =>
    onChange([...members], [...new Set([...replace, ...ids])]);
  const add = (id: string) => {
    setQuery("");
    if (single) onChange([id], []);
    else onChange([...members, id], [...replace]);
  };

  return (
    <div className="flex flex-col gap-4">
      {conflicts.length > 0 ? (
        <Alert
          kind="warning"
          title={t("conflictsTitle", { count: conflicts.length })}
          actions={
            conflicts.length > 1 ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => cancelTheirs(conflicts.map((c) => c.playerId))}
                >
                  {t("cancelAll")}
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  onClick={() => remove(conflicts.map((c) => c.playerId))}
                >
                  {t("leaveAllOut")}
                </Button>
              </>
            ) : undefined
          }
        >
          <p>{t("conflictsBody")}</p>
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {conflicts.map((c) => (
              <li
                key={c.playerId}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="min-w-0">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-secondary">{` · ${c.plan!.name}`}</span>
                </span>
                <span className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => cancelTheirs([c.playerId])}>
                    {t("cancelTheirs")}
                  </Button>
                  <Button size="sm" variant="tertiary" onClick={() => remove([c.playerId])}>
                    {t("leaveOut")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-secondary font-medium text-ink">
            {single ? t("person") : t("count", { count: chosen.length })}
          </span>
          {!single && chosen.length > 0 ? (
            <span className="text-label text-muted">{t("removeHint")}</span>
          ) : null}
        </div>
        {chosen.length > 0 ? (
          <ul className="flex flex-col divide-y divide-line">
            {chosen.map((c) => (
              <MemberRow
                key={c.playerId}
                person={c}
                plan={c.plan}
                moving={replace.includes(c.playerId)}
                action={
                  <Button
                    variant="ghost-danger"
                    size="sm"
                    iconOnly
                    action="delete"
                    onClick={() => remove([c.playerId])}
                  >
                    {t("remove", { name: c.name })}
                  </Button>
                }
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-control border-2 border-dashed border-line px-3 py-4 text-secondary text-muted">
            {single ? t("emptyPerson") : t("empty")}
          </p>
        )}
      </div>

      {!single ? <FeeSummary people={chosen} /> : null}

      <Field label={single && chosen.length > 0 ? t("change") : t("add")} hint={t("addHint")}>
        {(id, describedBy) => (
          <div className="relative">
            <Icon.MagnifyingGlass
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
            />
            <Input
              id={id}
              type="search"
              autoComplete="off"
              aria-describedby={describedBy}
              aria-controls={searchId}
              value={query}
              placeholder={t("searchPlaceholder")}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        )}
      </Field>
      {needle ? (
        <ul id={searchId} className="flex flex-col gap-1.5" aria-label={t("results")}>
          {results.length === 0 ? (
            <li className="text-secondary text-muted">{t("noResults")}</li>
          ) : (
            results.map((c) => (
              <li key={c.playerId}>
                <button
                  type="button"
                  onClick={() => add(c.playerId)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-control border border-line bg-surface px-3 py-2 text-left hover:bg-raised"
                >
                  <Avatar name={c.name} src={c.photoUrl} size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-ink">{c.name}</span>
                    <span className="text-label text-muted">
                      {[
                        c.level ? levelName(c.level) : null,
                        c.plan ? t("follows", { plan: c.plan.name }) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <Icon.Plus size={18} aria-hidden="true" className="shrink-0 text-club-text" />
                  <span className="sr-only">{t("addOne", { name: c.name })}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/** Para quién es un plan, en corto: "Todo el box", "Nivel RX", "Grupo Competición", "Una persona". */
export function useAudienceLabel() {
  const t = useT("fitness.planning.members.audience");
  const levelName = useLevelName();
  return (plan: Pick<PlanSummary, "audience" | "audienceLevel" | "audienceName">) =>
    plan.audience === "level" && plan.audienceLevel
      ? t("level", { level: levelName(plan.audienceLevel) })
      : plan.audience === "group" && plan.audienceName
        ? t("group", { name: plan.audienceName })
        : t(plan.audience === "level" || plan.audience === "group" ? "groupless" : plan.audience);
}
