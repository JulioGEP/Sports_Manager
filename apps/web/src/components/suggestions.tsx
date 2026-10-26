import { parseSuggestionEta, type SuggestionStatus } from "@sportsmanager/shared";
import { useCallback } from "react";
import { useIntl } from "react-intl";
import { useT } from "@/lib/intl";
import { StatusChip, type StatusKind } from "@/ui";

/**
 * Piezas comunes de las mejoras de la plataforma (ADR 0046): la pantalla del club y la bandeja de
 * la plataforma enseñan los estados y las fechas aproximadas igual.
 */

export const suggestionStatusKind: Record<SuggestionStatus, StatusKind> = {
  submitted: "neutral",
  open: "info",
  planned: "club",
  in_progress: "warning",
  released: "success",
  declined: "neutral",
  merged: "neutral",
};

export function SuggestionStatusChip({ status }: { status: SuggestionStatus }) {
  const t = useT("suggestionStatus");
  return <StatusChip kind={suggestionStatusKind[status]}>{t(status)}</StatusChip>;
}

/** "T1 2027" o "marzo de 2027": la fecha aproximada, en el idioma de quien la lee. */
export function useEtaLabel() {
  const intl = useIntl();
  const t = useT("roadmap.eta");
  return useCallback(
    (eta: string | null | undefined): string | null => {
      const parsed = parseSuggestionEta(eta);
      if (!parsed) return null;
      if (parsed.kind === "quarter")
        return t("quarter", { quarter: parsed.quarter, year: String(parsed.year) });
      return intl.formatDate(new Date(Date.UTC(parsed.year, parsed.month - 1, 15)), {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    },
    [intl, t],
  );
}

export const textareaClass =
  "w-full rounded-field border border-control bg-surface px-4 py-3 text-body text-ink outline-none " +
  "focus:border-2 focus:border-club focus:shadow-[0_0_0_4px_var(--club-soft)]";
