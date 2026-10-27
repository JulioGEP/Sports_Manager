import {
  BOX_AREAS,
  BOX_DASHBOARD_MAX_KPIS,
  BOX_KPIS,
  type BoxDashboard,
  type BoxKpi,
  type BoxKpiValue,
  type Permission,
} from "@sportsmanager/shared";
import { useCallback, useState, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { Link } from "react-router";
import { MeterBar, usePercent } from "@/components/fitness/owner-ui";
import { errorKey } from "@/lib/api";
import { screenIcon, screenTarget } from "@/lib/box-areas";
import { useReadyClub } from "@/lib/club";
import { useDashboard, useSaveDashboard } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { Alert, Button, EmptyState, Icon, Sheet, StatusChip, useToast } from "@/ui";

/**
 * Cuadro de mando del box (ADR 0055): los KPIs que el club ha elegido para Hoy o para la portada
 * de un área. Cada tarjeta dice su cifra, lo que la explica y, si algo pide atención, lo dice con
 * palabras; tocarla lleva a la pantalla donde se resuelve. Quien lleva los ajustes del club elige
 * cuáles salen y en qué orden, para todo el equipo.
 */
export function KpiBoard({
  dashboard,
  title,
  hideWhenEmpty = false,
}: {
  dashboard: BoxDashboard;
  title: ReactNode;
  /** Sin cifras que enseñar y sin poder elegirlas, no se pinta (el inicio del coach). */
  hideWhenEmpty?: boolean;
}) {
  const k = useT("fitness.kpis");
  const board = useDashboard(dashboard);
  const [editing, setEditing] = useState(false);
  const data = board.data;
  const values = new Map((data?.values ?? []).map((v) => [v.id, v]));
  const shown = (data?.kpis ?? []).flatMap((id) => {
    const v = values.get(id);
    return v ? [v] : [];
  });

  if (hideWhenEmpty && data && shown.length === 0 && !data.canEdit) return null;

  return (
    <section aria-labelledby={`kpis-${dashboard}`} className="flex flex-col gap-3">
      <div className="flex min-h-(--h-control) flex-wrap items-center justify-between gap-3">
        <h2 id={`kpis-${dashboard}`} className="text-title2 text-ink">
          {title}
        </h2>
        {data?.canEdit ? (
          <Button action="edit" variant="tertiary" size="sm" onClick={() => setEditing(true)}>
            {k("choose")}
          </Button>
        ) : null}
      </div>
      {board.isError ? <Alert kind="error">{k("loadError")}</Alert> : null}
      {board.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-card bg-raised" />
          ))}
        </div>
      ) : data && shown.length === 0 ? (
        <div className="rounded-card bg-surface shadow-card precisa:border precisa:border-border">
          <EmptyState
            icon={<Icon.ChartBar weight="duotone" />}
            title={k("empty.title")}
            description={data.canEdit ? k("empty.hint") : k("empty.readOnly")}
            action={
              data.canEdit ? (
                <Button action="add" variant="secondary" onClick={() => setEditing(true)}>
                  {k("choose")}
                </Button>
              ) : null
            }
          />
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {shown.map((v) => (
            <li key={v.id} className="flex">
              <KpiTile value={v} />
            </li>
          ))}
        </ul>
      )}
      {data?.canEdit && editing ? (
        <KpiEditor
          dashboard={dashboard}
          chosen={data.kpis}
          custom={data.custom}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </section>
  );
}

/** La cifra de un KPI como se lee: porcentaje, euros, "5/6", "+3", la franja… */
function useKpiFigure() {
  const intl = useIntl();
  const percent = usePercent();
  const k = useT("fitness.kpis");
  return useCallback(
    (v: BoxKpiValue): { main: string; extra: string | null } => {
      if (v.value === null) return { main: "–", extra: null };
      switch (BOX_KPIS[v.id].format) {
        case "percent":
          return { main: percent(v.value), extra: null };
        case "money":
          return {
            main: intl.formatNumber(v.value / 100, {
              style: "currency",
              currency: "EUR",
              minimumFractionDigits: 0,
              maximumFractionDigits: v.value % 100 === 0 ? 0 : 2,
            }),
            extra: null,
          };
        case "decimal":
          return { main: intl.formatNumber(v.value, { maximumFractionDigits: 1 }), extra: null };
        case "fraction":
          return { main: `${v.value}/${v.total ?? 0}`, extra: null };
        case "signed":
          return {
            main: v.value > 0 ? `+${v.value}` : v.value < 0 ? `−${Math.abs(v.value)}` : "0",
            extra: null,
          };
        case "slot":
          return {
            main: v.label ?? "–",
            extra: k("slotOccupancy", { percent: percent(v.value) }),
          };
        default:
          return { main: intl.formatNumber(v.value), extra: null };
      }
    },
    [intl, percent, k],
  );
}

function useHasPermission() {
  const { org } = useReadyClub();
  return useCallback((p: Permission) => org.actor.permissions.includes(p), [org.actor.permissions]);
}

const TONE_TEXT: Record<BoxKpiValue["tone"], string> = {
  neutral: "text-muted",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

/** Una tarjeta: nombre e icono de su pantalla, la cifra, su explicación y, si hay, a quién toca. */
function KpiTile({ value: v }: { value: BoxKpiValue }) {
  const k = useT("fitness.kpis");
  const { slug } = useReadyClub();
  const has = useHasPermission();
  const figure = useKpiFigure();
  const def = BOX_KPIS[v.id];
  const ScreenIcon = screenIcon(def.screen);
  const to = screenTarget(slug, def.screen, has);
  const { main, extra } = figure(v);
  const meter =
    v.value !== null && (def.format === "percent" || def.format === "slot") ? v.value : null;
  const hint = v.value === null ? k("noData") : k(`kpi.${v.id}.hint`, v.params);
  const ToneIcon =
    v.tone === "success" ? Icon.CheckCircle : v.tone === "neutral" ? null : Icon.Warning;

  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="text-secondary font-medium text-muted">{k(`kpi.${v.id}.label`)}</span>
        <span
          aria-hidden="true"
          className="hidden size-9 shrink-0 place-items-center rounded-full bg-club-soft text-club-soft-text sm:grid"
        >
          <ScreenIcon size={20} weight="duotone" />
        </span>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-title1 text-ink sm:text-display">{main}</span>
        {extra ? <span className="text-secondary text-muted">{extra}</span> : null}
        {v.delta !== null ? (
          <span title={k("delta", { delta: v.delta > 0 ? `+${v.delta}` : String(v.delta) })}>
            <StatusChip kind={v.delta > 0 ? "success" : v.delta < 0 ? "danger" : "neutral"}>
              {v.delta > 0 ? `+${v.delta}` : v.delta < 0 ? `−${Math.abs(v.delta)}` : "0"} pts
            </StatusChip>
          </span>
        ) : null}
      </span>
      {meter !== null ? <MeterBar ratio={meter} /> : null}
      <span className={`mt-auto flex items-start gap-1.5 text-secondary ${TONE_TEXT[v.tone]}`}>
        {ToneIcon ? (
          <ToneIcon size={18} weight="duotone" aria-hidden="true" className="mt-0.5 shrink-0" />
        ) : null}
        <span>{hint}</span>
      </span>
      {v.sample.length > 0 ? (
        <span className="truncate text-label text-muted">{v.sample.join(" · ")}</span>
      ) : null}
    </>
  );
  const box =
    "flex w-full min-w-0 flex-col gap-2 rounded-card bg-surface p-3 shadow-card sm:gap-3 sm:p-4 precisa:border precisa:border-border";
  return to ? (
    <Link
      to={to}
      title={k(`kpi.${v.id}.about`)}
      data-kpi={v.id}
      className={`${box} no-underline transition-colors hover:bg-raised`}
    >
      {body}
    </Link>
  ) : (
    <div title={k(`kpi.${v.id}.about`)} data-kpi={v.id} className={box}>
      {body}
    </div>
  );
}

/**
 * Elegir los KPIs de un cuadro: arriba los que salen, en su orden (subir, bajar, quitar); abajo
 * los que se pueden añadir, con su cifra de ahora para decidir con datos. Caben ocho. Se guarda
 * para todo el club; "Volver a los de serie" deshace la elección.
 */
function KpiEditor({
  dashboard,
  chosen,
  custom,
  onClose,
}: {
  dashboard: BoxDashboard;
  chosen: BoxKpi[];
  custom: boolean;
  onClose: () => void;
}) {
  const k = useT("fitness.kpis");
  const errors = useT("errors");
  const toast = useToast();
  const save = useSaveDashboard(dashboard);
  const preview = useDashboard(dashboard, { preview: true });
  const figure = useKpiFigure();
  const [draft, setDraft] = useState<BoxKpi[]>(chosen);
  const [busy, setBusy] = useState(false);
  const values = new Map((preview.data?.values ?? []).map((v) => [v.id, v]));
  const available = (preview.data?.available ?? []).filter((id) => !draft.includes(id));
  const full = draft.length >= BOX_DASHBOARD_MAX_KPIS;
  const name = (id: BoxKpi) => k(`kpi.${id}.label`);
  const now = (id: BoxKpi) => {
    const v = values.get(id);
    return v ? k("editor.now", { value: figure(v).main }) : null;
  };

  function move(index: number, by: -1 | 1) {
    setDraft((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item!);
      return next;
    });
  }

  async function run(kpis: BoxKpi[] | null) {
    setBusy(true);
    try {
      await save(kpis);
      toast("success", kpis === null ? k("editor.restored") : k("editor.saved"));
      onClose();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  // En Hoy se elige de todas las áreas: se agrupan para encontrarlos.
  const groups =
    dashboard === "today"
      ? BOX_AREAS.map((area) => ({
          key: area,
          title: k(`dashboards.${area}`),
          ids: available.filter((id) => BOX_KPIS[id].area === area),
        })).filter((g) => g.ids.length > 0)
      : [{ key: dashboard, title: null, ids: available }];

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={k("editor.cancel")}
      title={k("editor.title", { dashboard: k(`dashboards.${dashboard}`) })}
      description={k("editor.description")}
      footer={
        <>
          {custom ? (
            <Button
              action="restore"
              variant="tertiary"
              disabled={busy}
              onClick={() => void run(null)}
              className="precisa:mr-auto"
            >
              {k("editor.restore")}
            </Button>
          ) : null}
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {k("editor.cancel")}
          </Button>
          <Button action="save" loading={busy} onClick={() => void run(draft)}>
            {k("editor.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <section aria-labelledby="kpi-chosen" className="flex flex-col gap-2">
          <h3 id="kpi-chosen" className="text-label uppercase tracking-wide text-muted">
            {k("editor.chosen", { count: draft.length, max: BOX_DASHBOARD_MAX_KPIS })}
          </h3>
          {draft.length === 0 ? (
            <p className="text-secondary text-muted">{k("editor.chosenEmpty")}</p>
          ) : (
            <ol className="flex flex-col divide-y divide-line rounded-field border border-line">
              {draft.map((id, i) => (
                <li key={id} className="flex min-h-14 items-center gap-2 py-1 pr-1 pl-3">
                  <span className="w-5 shrink-0 font-mono text-secondary text-muted">{i + 1}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-ink">{name(id)}</span>
                    {now(id) ? (
                      <span className="truncate font-mono text-label text-muted">{now(id)}</span>
                    ) : null}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    icon={<Icon.ArrowUp size={16} aria-hidden="true" />}
                    disabled={i === 0}
                    className={i === 0 ? "invisible" : ""}
                    onClick={() => move(i, -1)}
                  >
                    {k("editor.up", { name: name(id) })}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    icon={<Icon.ArrowDown size={16} aria-hidden="true" />}
                    disabled={i === draft.length - 1}
                    className={i === draft.length - 1 ? "invisible" : ""}
                    onClick={() => move(i, 1)}
                  >
                    {k("editor.down", { name: name(id) })}
                  </Button>
                  <Button
                    action="delete"
                    variant="ghost-danger"
                    size="sm"
                    iconOnly
                    onClick={() => setDraft((list) => list.filter((x) => x !== id))}
                  >
                    {k("editor.remove", { name: name(id) })}
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="kpi-available" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h3 id="kpi-available" className="text-label uppercase tracking-wide text-muted">
              {k("editor.available")}
            </h3>
            {full ? <p className="text-secondary text-warning">{k("editor.full")}</p> : null}
          </div>
          {preview.isPending ? (
            <div className="h-24 animate-pulse rounded-field bg-raised" />
          ) : available.length === 0 ? (
            <p className="text-secondary text-muted">{k("editor.availableEmpty")}</p>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="flex flex-col gap-1">
                {g.title ? (
                  <h4 className="text-secondary font-medium text-ink">{g.title}</h4>
                ) : null}
                <ul className="flex flex-col divide-y divide-line rounded-field border border-line">
                  {g.ids.map((id) => (
                    <li key={id} className="flex min-h-14 items-center gap-2 py-2 pr-1 pl-3">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="font-medium text-ink">{name(id)}</span>
                        <span className="text-label text-muted">{k(`kpi.${id}.about`)}</span>
                        {now(id) ? (
                          <span className="font-mono text-label text-muted">{now(id)}</span>
                        ) : null}
                      </span>
                      <Button
                        action="add"
                        variant="ghost"
                        size="sm"
                        iconOnly
                        disabled={full}
                        onClick={() => setDraft((list) => [...list, id])}
                      >
                        {k("editor.add", { name: name(id) })}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
    </Sheet>
  );
}
