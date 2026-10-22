import { SESSION_BLOCKS, type SessionDetailResponse } from "@sportsmanager/shared";
import { useParams } from "react-router";
import {
  AvailabilityChip,
  DrillBoard,
  RestrictionTags,
  useLoadFormat,
  useShortDate,
} from "@/components/training-ui";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { BackLink, Button, Icon } from "@/ui";
import { SessionGate, useItemFacts, useSessionDetail } from "./session";
import { useClubTimezone } from "./team-training";

/**
 * En papel solo sale la hoja: lo demás de la página se oculta y la hoja se pone arriba del todo,
 * en A4 y con sus colores (la pizarra y las disponibilidades).
 */
const PRINT_CSS = `@page { size: A4; margin: 12mm; }
@media print {
  body * { visibility: hidden; }
  #session-print, #session-print * { visibility: visible; }
  #session-print { position: absolute; inset: 0 auto auto 0; width: 100%; overflow: visible; }
  #session-print { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

/** Hoja de la sesión para imprimir (ADR 0039): cabecera, tareas por bloque con su pizarra y la plantilla con casillas. */
export function SessionPrintPage() {
  const { id = "" } = useParams();
  const detail = useSessionDetail(id);
  return <SessionGate query={detail}>{(data) => <PrintSheet data={data} />}</SessionGate>;
}

function PrintSheet({ data }: { data: SessionDetailResponse }) {
  const t = useT("session.print");
  const st = useT("session");
  const blocksT = useT("sessionBlocks");
  const ss = useT("sessionStatus");
  const { slug, branding } = useReadyClub();
  const paths = clubPaths(slug);
  const tz = useClubTimezone();
  const dates = useShortDate();
  const fmt = useLoadFormat();
  const facts = useItemFacts();
  const { session, items, roster, contents } = data;
  const contentName = (id: string) => contents.find((ct) => ct.id === id)?.name;
  const cycle = data.cycles.find((cy) => cy.id === session.cycleId)?.name;

  const summary = [
    { term: st("objective"), detail: session.objective ?? "—" },
    { term: st("targetRpe"), detail: session.targetRpe ?? "—" },
    {
      term: t("planned"),
      detail: `${fmt.minutes(session.plannedMinutes)} · ${fmt.load(session.plannedLoad)}`,
    },
    ...(cycle ? [{ term: st("cycle"), detail: cycle }] : []),
    ...(session.contentIds.length > 0
      ? [
          {
            term: st("contents"),
            detail: session.contentIds.map(contentName).filter(Boolean).join(", "),
          },
        ]
      : []),
  ];

  return (
    <div
      id="session-print"
      className="fixed inset-0 z-40 overflow-y-auto bg-surface text-ink print:static print:overflow-visible"
    >
      <style>{PRINT_CSS}</style>
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2 print:hidden">
        <BackLink to={paths.session(session.id)}>{t("back")}</BackLink>
        <Button icon={<Icon.Printer size={18} aria-hidden="true" />} onClick={() => window.print()}>
          {t("print")}
        </Button>
      </div>

      <article className="mx-auto flex max-w-[210mm] flex-col gap-5 p-6 text-secondary print:max-w-none print:p-0">
        <header className="flex flex-col gap-2 border-b-2 border-ink pb-3">
          <p className="text-label uppercase tracking-wide text-muted">
            {branding.name} · {t("heading")}
          </p>
          <h1 className="text-title1 first-letter:uppercase">
            {session.team.name} · {dates.long(session.date)}
          </h1>
          <p className="text-muted">
            {[
              `${dates.time(session.startsAt, tz)}–${dates.time(session.endsAt, tz)}`,
              session.facility?.name,
              session.mdLabel,
              ss(session.status),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            {summary.map((s) => (
              <div key={s.term} className="contents">
                <dt className="text-muted">{s.term}</dt>
                <dd className="font-medium">{s.detail}</dd>
              </div>
            ))}
          </dl>
        </header>

        {SESSION_BLOCKS.map((block) => {
          const list = items
            .filter((i) => i.block === block)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          if (list.length === 0) return null;
          const minutes = list.reduce((sum, i) => sum + i.minutes, 0);
          return (
            <section key={block} className="flex flex-col gap-2">
              <h2 className="flex items-baseline justify-between border-b border-line pb-1 text-title2">
                {blocksT(block)}
                <span className="font-mono text-secondary text-muted">{fmt.minutes(minutes)}</span>
              </h2>
              <ol className="flex flex-col gap-3">
                {list.map((item) => {
                  const itemFacts = facts(item, roster);
                  const names = item.contentIds.map(contentName).filter(Boolean);
                  return (
                    <li key={item.id} className="flex gap-3 break-inside-avoid">
                      {item.diagram ? (
                        <div className="w-36 shrink-0">
                          <DrillBoard diagram={item.diagram} label={item.title} />
                        </div>
                      ) : null}
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="text-body font-semibold">{item.title}</h3>
                          <span className="font-mono">{fmt.minutes(item.minutes)}</span>
                        </div>
                        {itemFacts.length > 0 ? <p>{itemFacts.join(" · ")}</p> : null}
                        {names.length > 0 ? <p className="text-muted">{names.join(", ")}</p> : null}
                        <RestrictionTags tags={item.restrictionTags} />
                        {item.description ? (
                          <p className="whitespace-pre-line">{item.description}</p>
                        ) : null}
                        {item.coachingPoints ? (
                          <p className="whitespace-pre-line">
                            <span className="font-semibold">{t("coachingPoints")}: </span>
                            {item.coachingPoints}
                          </p>
                        ) : null}
                        {item.notes ? (
                          <p className="whitespace-pre-line italic">{item.notes}</p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}

        {items.length === 0 ? <p className="text-muted">{t("noItems")}</p> : null}

        <section className="flex flex-col gap-2 break-inside-avoid">
          <h2 className="border-b border-line pb-1 text-title2">{t("roster")}</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-label uppercase tracking-wide text-muted">
                <th className="py-1 pr-2 font-semibold">{t("player")}</th>
                <th className="py-1 pr-2 font-semibold">{t("availability")}</th>
                <th className="w-20 py-1 pr-2 text-center font-semibold">{t("attendance")}</th>
                <th className="w-16 py-1 text-center font-semibold">{t("rpe")}</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.playerId} className="border-t border-line">
                  <td className="py-1.5 pr-2">
                    {r.shirtNumber !== null ? (
                      <span className="font-mono text-muted">{r.shirtNumber} </span>
                    ) : null}
                    {r.name}
                  </td>
                  <td className="py-1.5 pr-2">
                    <AvailabilityChip value={r.availability} />
                  </td>
                  <td className="py-1.5 pr-2 text-center">
                    <span
                      aria-hidden="true"
                      className="inline-block size-4 rounded-sm border border-ink align-middle"
                    />
                  </td>
                  <td className="py-1.5 text-center">
                    <span
                      aria-hidden="true"
                      className="inline-block h-4 w-10 border-b border-ink align-middle"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {session.notes ? (
          <section className="flex flex-col gap-1 break-inside-avoid">
            <h2 className="border-b border-line pb-1 text-title2">{st("notes")}</h2>
            <p className="whitespace-pre-line">{session.notes}</p>
          </section>
        ) : null}
      </article>
    </div>
  );
}
