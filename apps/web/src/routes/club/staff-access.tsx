import {
  ACCESS_AREAS,
  AccessOverviewResponseSchema,
  AccessProfileRowSchema,
  type AccessArea,
  type AccessProfileRow,
  type ConfigurableProfile,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch, errorKey } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { Alert, Button, Card, EmptyState, Icon, StatusChip, useToast } from "@/ui";

/**
 * Qué ve cada rol (Bloque 19, ADR 0033): una matriz con un check por rol o cargo y área. Lo que
 * se marca o desmarca respecto a lo de por defecto queda como regla del club; volver a lo de por
 * defecto la borra. El alcance (todo el club, sus secciones, sus equipos, los deportistas que
 * atiende) va con el cargo y se enseña, pero no se cambia aquí. Debajo, las exclusiones por persona.
 */
export function AccessMatrix() {
  const t = useT("members.access");
  const roles = useT("roles");
  const positions = useT("positions");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const [busy, setBusy] = useState<string | null>(null);
  const access = useQuery({
    queryKey: ["org", slug, "access"],
    queryFn: () => apiFetch("/api/org/access", { schema: AccessOverviewResponseSchema }),
  });
  const profileLabel = (p: ConfigurableProfile) => (p === "coach" ? roles("coach") : positions(p));
  const areaLabel = (a: AccessArea) => t(`areas.${a}`);

  async function setArea(profile: ConfigurableProfile, area: AccessArea, visible: boolean) {
    setBusy(`${profile}.${area}`);
    try {
      await apiFetch(`/api/org/access/profiles/${profile}/areas/${area}`, {
        method: "PUT",
        body: { visible },
        schema: AccessProfileRowSchema,
      });
      toast("success", t("saved", { profile: profileLabel(profile) }));
      // Los permisos de quien mira pueden cambiar: se refresca todo el club.
      await client.invalidateQueries({ queryKey: ["org", slug] });
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(null);
    }
  }

  async function reset(row: AccessProfileRow) {
    for (const a of row.areas) {
      if (a.visible !== a.default) await setArea(row.profile, a.area, a.default);
    }
  }

  const rows = access.data?.profiles ?? [];
  const exclusions = access.data?.exclusions ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card title={t("title")} description={t("description")} padded={false}>
        {access.isError ? (
          <div className="p-5">
            <Alert kind="error">{t("error")}</Alert>
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-body">
            <thead>
              <tr className="border-b border-line text-left text-label uppercase tracking-wide text-muted">
                <th scope="col" className="sticky left-0 bg-surface px-5 py-3 font-medium">
                  {t("profile")}
                </th>
                {ACCESS_AREAS.map((area) => (
                  <th key={area} scope="col" className="px-2 py-3 text-center font-medium">
                    {areaLabel(area)}
                  </th>
                ))}
                <th scope="col" className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const changed = row.areas.some((a) => a.visible !== a.default);
                return (
                  <tr key={row.profile} className="border-b border-line last:border-b-0">
                    <th
                      scope="row"
                      className="sticky left-0 bg-surface px-5 py-3 text-left font-medium text-ink"
                    >
                      <span className="flex flex-col gap-1">
                        <span>{profileLabel(row.profile)}</span>
                        <span className="text-secondary font-normal text-muted">
                          {t("scopeLabel")}: {t(`scope.${row.scope}`)}
                        </span>
                      </span>
                    </th>
                    {row.areas.map((a) => {
                      return (
                        <td key={a.area} className="px-2 py-3 text-center">
                          <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                            <input
                              type="checkbox"
                              className="size-5 accent-club"
                              checked={a.visible}
                              disabled={busy !== null}
                              aria-label={t("toggle", {
                                area: areaLabel(a.area),
                                profile: profileLabel(row.profile),
                              })}
                              title={a.visible !== a.default ? t("changed") : undefined}
                              onChange={(e) => void setArea(row.profile, a.area, e.target.checked)}
                            />
                            {a.visible !== a.default ? (
                              <span className="sr-only">{t("changed")}</span>
                            ) : null}
                          </label>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-right">
                      {changed ? (
                        <Button
                          variant="tertiary"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => void reset(row)}
                        >
                          {t("reset")}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-4 text-secondary text-muted">{t("adminNote")}</p>
      </Card>

      <Card title={t("exclusionsTitle")} description={t("exclusionsDescription")} padded={false}>
        {access.data && exclusions.length === 0 ? (
          <EmptyState icon={<Icon.Users weight="duotone" />} title={t("exclusionsEmpty")} />
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {exclusions.map((e) => (
              <li key={e.userId} className="flex min-h-14 flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1 font-medium text-ink">{e.name}</span>
                <span className="flex flex-wrap gap-1">
                  {e.areas.map((a) => (
                    <StatusChip key={a} kind="warning">
                      {areaLabel(a)}
                    </StatusChip>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
