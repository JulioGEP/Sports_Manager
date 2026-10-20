import { ageOn } from "@sportsmanager/shared";
import { useIntl } from "react-intl";

/** Fechas de calendario (`AAAA-MM-DD`) sin zona: se formatean como UTC para no restar un día. */
export function useDates() {
  const intl = useIntl();
  const day = (iso: string | null | undefined) =>
    iso
      ? intl.formatDate(new Date(`${iso}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })
      : "";
  const range = (from: string, to: string) => `${day(from)} – ${day(to)}`;
  return { day, range, age: (iso: string | null | undefined) => ageOn(iso) };
}
