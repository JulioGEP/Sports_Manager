import { formatSeconds, planTestByCode } from "@sportsmanager/shared";
import { useIntl } from "react-intl";
import { useSearchParams } from "react-router";
import { CycleMap, usePlanNames } from "@/components/fitness/planning-ui";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { useMyCycleSummary } from "@/lib/planning";
import { Alert, Button, PageHeader, useToast } from "@/ui";

/**
 * Tu ciclo en cifras (ADR 0052): una tarjeta para guardar o compartir al acabar (o a mitad) de un
 * plan: sesiones, marcas personales y cada test de la partida a la última marca.
 */
export function CycleSummaryPage() {
  const t = useT("fitness.planning.summary");
  const names = usePlanNames();
  const intl = useIntl();
  const toast = useToast();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [params] = useSearchParams();
  const summary = useMyCycleSummary(params.get("plan"));
  const num = (v: number) => intl.formatNumber(v, { maximumFractionDigits: 1 });
  const valueOf = (code: string, v: number) => {
    const test = planTestByCode(code);
    if (test?.lowerIsBetter) return formatSeconds(Math.round(v));
    if (test?.kind === "movement") return `${num(v)} kg`;
    return num(v);
  };

  if (summary.isError)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader backTo={paths.cycle} backLabel={t("back")} title={t("title")} />
        <Alert kind="info">{t("none")}</Alert>
      </div>
    );
  if (!summary.data)
    return <div className="h-96 animate-pulse rounded-card bg-raised" aria-busy="true" />;
  const s = summary.data;
  const improved = s.tests.filter((x) => {
    if (x.baseline === null || x.latest === null) return false;
    return planTestByCode(x.code)?.lowerIsBetter ? x.latest < x.baseline : x.latest > x.baseline;
  });

  async function share() {
    const text = t("shareText", {
      name: s.plan.name,
      club: s.club,
      sessions: s.sessions,
      prs: s.prs,
    });
    try {
      if (navigator.share)
        await navigator.share({ title: s.plan.name, text, url: window.location.href });
      else {
        await navigator.clipboard.writeText(`${text} ${window.location.href}`);
        toast("success", t("copied"));
      }
    } catch {
      // Compartir cancelado: nada que decir.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backTo={paths.cycle}
        backLabel={t("back")}
        title={t("title")}
        actions={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              {t("print")}
            </Button>
            <Button action="link" onClick={() => void share()}>
              {t("share")}
            </Button>
          </>
        }
      />
      <article className="mx-auto flex w-full max-w-md flex-col gap-5 overflow-hidden rounded-card bg-ink p-6 text-surface shadow-float">
        <header className="flex flex-col gap-1">
          <span className="text-label uppercase tracking-[0.2em] opacity-70">{s.club}</span>
          <h1 className="text-display leading-none">{s.plan.name}</h1>
          <span className="text-secondary opacity-80">
            {`${s.athlete.firstName} ${s.athlete.lastName} · ${names.shortDate(s.plan.startsOn)} – ${names.shortDate(s.plan.endsOn)}`}
          </span>
        </header>
        <div className="grid grid-cols-3 gap-3">
          {[
            [s.sessions, t("sessions")],
            [s.prs, t("prs")],
            [s.plan.weeks, t("weeks")],
          ].map(([value, label]) => (
            <div
              key={String(label)}
              className="flex flex-col rounded-control bg-surface/10 px-3 py-2"
            >
              <span className="font-mono text-title1">{value}</span>
              <span className="text-label opacity-70">{label}</span>
            </div>
          ))}
        </div>
        <div className="rounded-control bg-surface p-3 text-ink">
          <CycleMap
            structure={s.plan.structure}
            startsOn={s.plan.startsOn}
            current={null}
            compact
          />
        </div>
        {s.tests.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {s.tests.map((x) => (
              <li
                key={x.code}
                className="flex items-center justify-between gap-3 border-b border-surface/15 pb-2 last:border-0"
              >
                <span className="text-secondary">{names.test(x.code)}</span>
                <span className="font-mono text-secondary">
                  {x.baseline !== null ? valueOf(x.code, x.baseline) : "—"}
                  {" → "}
                  <span className="font-semibold">
                    {x.latest !== null ? valueOf(x.code, x.latest) : "—"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <footer className="text-label opacity-70">
          {s.finished
            ? t("finished", { improved: improved.length, tests: s.tests.length })
            : t("inProgress")}
        </footer>
      </article>
    </div>
  );
}
