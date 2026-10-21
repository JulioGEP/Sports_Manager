import {
  FacilitiesResponseSchema,
  TeamScheduleResponseSchema,
  WEEKDAYS,
  type TeamScheduleSlotResponse,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, errorKey } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { Alert, Button, Input, Select, Sheet, useToast } from "@/ui";

type Slot = { weekday: number; startsAt: string; endsAt: string; facilityId: string };

/**
 * Horario semanal de un equipo o grupo (Bloque 16): franjas por día con instalación. Al guardar
 * se puede regenerar la agenda de la temporada a partir de hoy (los entrenamientos con lista
 * pasada se respetan).
 */
export function ScheduleSheet({
  open,
  teamId,
  slots,
  onClose,
  onSaved,
}: {
  open: boolean;
  teamId: string;
  slots: TeamScheduleSlotResponse[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("team.scheduleSheet");
  const weekdays = useT("weekdays");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const [rows, setRows] = useState<Slot[]>([]);
  const [generate, setGenerate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const facilities = useQuery({
    queryKey: ["org", slug, "facilities"],
    queryFn: () => apiFetch("/api/org/facilities", { schema: FacilitiesResponseSchema }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setRows(
      slots.map((s) => ({
        weekday: s.weekday,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        facilityId: s.facility?.id ?? "",
      })),
    );
    setError(null);
  }, [open, slots]);

  const edit = (index: number, patch: Partial<Slot>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await apiFetch(`/api/org/teams/${teamId}/schedule`, {
        method: "PUT",
        body: {
          slots: rows.map((r) => ({ ...r, facilityId: r.facilityId || null })),
          generate,
        },
        schema: TeamScheduleResponseSchema,
      });
      toast("success", generate ? t("savedGenerated", { count: result.generated }) : t("saved"));
      onClose();
      onSaved();
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" type="submit" form="schedule-form" loading={busy}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="schedule-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <ul className="flex flex-col gap-3">
          {rows.map((row, i) => (
            <li
              key={i}
              className="grid grid-cols-[1fr_auto] gap-2 rounded-field border border-control p-3 sm:grid-cols-[1.2fr_1fr_1fr_1.4fr_auto]"
            >
              <Select
                aria-label={t("weekday")}
                value={row.weekday}
                onChange={(e) => edit(i, { weekday: Number(e.target.value) })}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {weekdays(String(d))}
                  </option>
                ))}
              </Select>
              <Button
                action="delete"
                type="button"
                variant="danger"
                size="sm"
                className="sm:order-last"
                onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
              >
                {c("remove")}
              </Button>
              <Input
                type="time"
                aria-label={t("startsAt")}
                value={row.startsAt}
                onChange={(e) => edit(i, { startsAt: e.target.value })}
                required
              />
              <Input
                type="time"
                aria-label={t("endsAt")}
                value={row.endsAt}
                onChange={(e) => edit(i, { endsAt: e.target.value })}
                required
              />
              <Select
                aria-label={t("facility")}
                value={row.facilityId}
                onChange={(e) => edit(i, { facilityId: e.target.value })}
                className="col-span-2 sm:col-span-1"
              >
                <option value="">{t("noFacility")}</option>
                {(facilities.data?.facilities ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
        <Button
          action="add"
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              { weekday: 1, startsAt: "18:00", endsAt: "19:00", facilityId: "" },
            ])
          }
        >
          {t("addSlot")}
        </Button>
        <label className="flex items-center gap-3 text-body text-ink">
          <input
            type="checkbox"
            checked={generate}
            onChange={(e) => setGenerate(e.target.checked)}
          />
          {t("generate")}
        </label>
        <p className="text-secondary text-muted">{t("generateHint")}</p>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}
