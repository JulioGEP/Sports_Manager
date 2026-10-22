import {
  ACCESS_AREAS,
  AccessOverviewResponseSchema,
  AccessProfileRowSchema,
  defaultPermissionsOf,
  isAreaVisible,
  MemberExclusionsResponseSchema,
  MembersResponseSchema,
  profileOf,
  scopeKindsOf,
  type AccessArea,
  type AccessOverviewResponse,
  type AccessProfileRow,
  type ConfigurableProfile,
  type MembershipRole,
  type MembersResponse,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { apiFetch, errorKey } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import {
  Alert,
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Icon,
  Select,
  Sheet,
  StatusChip,
  useToast,
} from "@/ui";

type Exclusion = AccessOverviewResponse["exclusions"][number];
type Member = MembersResponse["members"][number];

/** Las pertenencias de una persona del personal, con su cargo: de ahí salen su perfil y su alcance. */
const membershipsOf = (m: Member): MembershipRole[] =>
  m.roles.map((roleCode) => ({ roleCode, position: roleCode === "staff" ? m.position : null }));

/**
 * Lo que una persona ve por su rol, antes de sus exclusiones: por cada rol o cargo, lo que dice la
 * matriz del club (el rol y el cargo con las reglas aplicadas); con varios, la suma. Mismo cálculo
 * que la API (`effectivePermissions` sin las exclusiones de la persona).
 */
function areasByRole(member: Member, profiles: AccessProfileRow[]): Set<AccessArea> {
  const visible = new Set<AccessArea>();
  for (const membership of membershipsOf(member)) {
    const profile = profileOf(membership);
    const row = profiles.find((p) => p.profile === profile);
    for (const area of ACCESS_AREAS) {
      const sees = row
        ? (row.areas.find((a) => a.area === area)?.visible ?? false)
        : isAreaVisible(defaultPermissionsOf(profile), area);
      if (sees) visible.add(area);
    }
  }
  return visible;
}

/**
 * Qué ve cada rol (Bloque 19, ADR 0033): una matriz con un check por rol o cargo y área. Lo que
 * se marca o desmarca respecto a lo de por defecto queda como regla del club; volver a lo de por
 * defecto la borra. El alcance (todo el club, sus secciones, sus equipos, los deportistas que
 * atiende) va con el cargo y se enseña, pero no se cambia aquí. Debajo, las exclusiones por persona:
 * se añaden, se cambian y se quitan aquí mismo, y en ningún otro sitio.
 */
export function AccessMatrix() {
  const t = useT("members.access");
  const roles = useT("roles");
  const positions = useT("positions");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const c = useT("common");
  const [busy, setBusy] = useState<string | null>(null);
  /** Hoja de exclusiones: `"new"` para añadir a alguien, o la exclusión que se edita. */
  const [editing, setEditing] = useState<Exclusion | "new" | null>(null);
  const [removing, setRemoving] = useState<Exclusion | null>(null);
  const access = useQuery({
    queryKey: ["org", slug, "access"],
    queryFn: () => apiFetch("/api/org/access", { schema: AccessOverviewResponseSchema }),
  });
  /** Para decir el rol de cada persona con exclusiones (y lo que ve por él, en la hoja). */
  const members = useQuery({
    queryKey: ["org", slug, "members"],
    queryFn: () => apiFetch("/api/org/members", { schema: MembersResponseSchema }),
  });
  const roleOf = (userId: string) => {
    const m = members.data?.members.find((x) => x.userId === userId);
    return m
      ? m.roles
          .map((r) => (r === "staff" && m.position ? positions(m.position) : roles(r)))
          .join(" · ")
      : null;
  };
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

  /** Quitar las exclusiones de una persona: vuelve a ver todo lo que ve su rol. */
  async function removeExclusion(e: Exclusion) {
    setRemoving(null);
    try {
      await apiFetch(`/api/org/access/members/${e.userId}`, {
        method: "PUT",
        body: { areas: [] },
        schema: MemberExclusionsResponseSchema,
      });
      toast("success", t("removed", { name: e.name }));
      await client.invalidateQueries({ queryKey: ["org", slug] });
    } catch (err) {
      toast("error", errors(errorKey(err)));
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

      <Card
        title={t("exclusionsTitle")}
        description={t("exclusionsDescription")}
        padded={false}
        actions={
          <Button action="add" variant="secondary" size="sm" onClick={() => setEditing("new")}>
            {t("addExclusion")}
          </Button>
        }
      >
        {access.data && exclusions.length === 0 ? (
          <EmptyState
            icon={<Icon.Users weight="duotone" />}
            title={t("exclusionsEmpty")}
            description={t("exclusionsEmptyHint")}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-line" aria-label={t("exclusionsTitle")}>
            {exclusions.map((e) => (
              <li key={e.userId} className="flex min-h-16 flex-wrap items-center gap-3 px-5 py-3">
                <Avatar name={e.name} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-medium text-ink">
                    {e.name}
                    {roleOf(e.userId) ? (
                      <span className="font-normal text-muted"> · {roleOf(e.userId)}</span>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {e.areas.map((a) => (
                      <StatusChip key={a} kind="warning">
                        {t("excludedArea", { area: areaLabel(a) })}
                      </StatusChip>
                    ))}
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  <Button action="edit" variant="secondary" size="sm" onClick={() => setEditing(e)}>
                    {t("editExclusion")}
                  </Button>
                  <Button action="delete" variant="danger" size="sm" onClick={() => setRemoving(e)}>
                    {t("removeExclusion")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing ? (
        <ExclusionSheet
          editing={editing === "new" ? null : editing}
          exclusions={exclusions}
          profiles={rows}
          onClose={() => setEditing(null)}
          onSaved={() => void client.invalidateQueries({ queryKey: ["org", slug] })}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={t("confirmRemoveTitle", { name: removing?.name ?? "" })}
        body={t("confirmRemoveBody")}
        confirmLabel={t("removeExclusion")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => removing && void removeExclusion(removing)}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

/**
 * Añadir o cambiar las exclusiones de una persona: quién (solo al añadir) y qué áreas no ve aunque
 * su rol sí. Enseña lo que ya trae su rol: su alcance, y las áreas que su rol no ve aparecen
 * marcadas y bloqueadas ("Por su rol"); solo se excluye lo que su rol sí ve. La administración del
 * club no aparece: no se puede excluir. Sin ningún área marcada, la persona deja de tener exclusiones.
 */
function ExclusionSheet({
  editing,
  exclusions,
  profiles,
  onClose,
  onSaved,
}: {
  editing: Exclusion | null;
  exclusions: Exclusion[];
  profiles: AccessProfileRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("members.access");
  const ts = useT("members.access.exclusionSheet");
  const roles = useT("roles");
  const positions = useT("positions");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const members = useQuery({
    queryKey: ["org", slug, "members"],
    queryFn: () => apiFetch("/api/org/members", { schema: MembersResponseSchema }),
  });
  /** Se puede excluir a quien trabaja en el club y no lo administra: ni familias solas ni administración. */
  const candidates = (members.data?.members ?? []).filter(
    (m) => !m.roles.includes("org_admin") && !(m.roles.length === 1 && m.roles[0] === "guardian"),
  );
  const [userId, setUserId] = useState(editing?.userId ?? "");
  const selectedId = editing?.userId ?? (userId || candidates[0]?.userId || "");
  const selected = (members.data?.members ?? []).find((m) => m.userId === selectedId) ?? null;
  const selectedName = editing?.name ?? selected?.name ?? "";
  const current = (id: string) => new Set(exclusions.find((e) => e.userId === id)?.areas ?? []);
  const [excluded, setExcluded] = useState<Set<AccessArea>>(() => current(editing?.userId ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleLabel = (m: Member) =>
    m.roles
      .map((r) => (r === "staff" && m.position ? positions(m.position) : roles(r)))
      .join(" · ");
  const areaLabel = (a: AccessArea) => t(`areas.${a}`);

  /** Lo que trae su rol: hasta que se sabe quién es, nada se bloquea. */
  const byRole = selected ? areasByRole(selected, profiles) : null;
  const seesByRole = (a: AccessArea) => byRole === null || byRole.has(a);
  /** Solo cuenta lo que su rol ve: excluir lo que ya no ve no cambia nada. */
  const toSave = ACCESS_AREAS.filter((a) => excluded.has(a) && seesByRole(a));
  const hiddenByRole = byRole ? ACCESS_AREAS.filter((a) => !byRole.has(a)) : [];
  const scopeKinds = selected ? scopeKindsOf(membershipsOf(selected)) : null;
  const scopeLabel = scopeKinds
    ? scopeKinds.has("club")
      ? t("scope.club")
      : [...scopeKinds].map((k) => t(`scope.${k}`)).join(" · ")
    : "";

  function choose(id: string) {
    setUserId(id);
    // Al elegir a alguien que ya tiene exclusiones, se parte de las suyas.
    setExcluded(current(id));
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    if (editing === null && toSave.length === 0) {
      setError(ts("none"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/org/access/members/${selectedId}`, {
        method: "PUT",
        body: { areas: toSave },
        schema: MemberExclusionsResponseSchema,
      });
      toast(
        "success",
        toSave.length === 0
          ? t("removed", { name: selectedName })
          : ts("saved", { name: selectedName }),
      );
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
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={editing ? ts("titleEdit", { name: editing.name }) : ts("titleNew")}
      description={ts("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action="save"
            type="submit"
            form="exclusion-form"
            loading={busy}
            disabled={!selectedId}
          >
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="exclusion-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {editing === null ? (
          members.data && candidates.length === 0 ? (
            <Alert kind="info">{ts("empty")}</Alert>
          ) : (
            <Field label={ts("person")}>
              {(id) => (
                <Select id={id} value={selectedId} onChange={(e) => choose(e.target.value)}>
                  {candidates.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} · {roleLabel(m)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )
        ) : null}

        {selected ? (
          <section
            aria-labelledby="exclusion-by-role"
            className="flex flex-col gap-2 rounded-field border border-border bg-raised px-4 py-3"
          >
            <h3 id="exclusion-by-role" className="text-secondary font-medium text-ink">
              {ts("byRoleTitle", { roles: roleLabel(selected) })}
            </h3>
            <p className="text-secondary text-muted">{ts("scope", { scope: scopeLabel })}</p>
            <p className="text-secondary text-muted">
              {hiddenByRole.length === 0
                ? ts("seesAll")
                : ts("hides", { areas: hiddenByRole.map(areaLabel).join(", ") })}
            </p>
          </section>
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1 text-secondary font-medium text-ink">{ts("areas")}</legend>
          <ul className="flex flex-col gap-1">
            {ACCESS_AREAS.map((area) => {
              const byItsRole = !seesByRole(area);
              return (
                <li key={area}>
                  <label
                    className={`flex min-h-11 items-center gap-3 rounded-field px-2 ${byItsRole ? "" : "hover:bg-raised"}`}
                  >
                    <input
                      type="checkbox"
                      className="size-5 accent-club"
                      checked={byItsRole || excluded.has(area)}
                      disabled={busy || byItsRole}
                      onChange={(e) =>
                        setExcluded((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(area);
                          else next.delete(area);
                          return next;
                        })
                      }
                    />
                    <span className={`flex-1 text-body ${byItsRole ? "text-muted" : "text-ink"}`}>
                      {ts("exclude", { area: areaLabel(area) })}
                    </span>
                    {byItsRole ? <StatusChip kind="neutral">{ts("byRoleChip")}</StatusChip> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}
