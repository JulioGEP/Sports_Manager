import {
  FACILITY_KINDS,
  FacilitiesResponseSchema,
  FacilityCreateSchema,
  FacilityResponseSchema,
  type Facility,
  type FacilityKind,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useClubModel } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  Sheet,
  StatusChip,
  useToast,
} from "@/ui";

/**
 * Instalaciones del club (Bloque 16): la piscina, las pistas, las salas. Cada una con sus franjas
 * de apertura y lo que la ocupa esta semana. La ficha está en `facility.tsx`.
 */

/** Icono por tipo de instalación. */
export function facilityIcon(kind: FacilityKind, size = 20): ReactNode {
  const props = { size, weight: "duotone" as const, "aria-hidden": true as const };
  switch (kind) {
    case "pool":
      return <Icon.Lifebuoy {...props} />;
    case "court":
      return <Icon.SquaresFour {...props} />;
    case "field":
      return <Icon.MapPin {...props} />;
    case "room":
      return <Icon.Buildings {...props} />;
    case "gym":
      return <Icon.Barbell {...props} />;
    default:
      return <Icon.DotsThree {...props} />;
  }
}

export function FacilitiesPage() {
  const t = useT("facilities");
  const kinds = useT("facilityKinds");
  const { slug, org } = useReadyClub();
  const paths = clubPaths(slug);
  const [params, setParams] = useSearchParams();
  const canWrite = org.actor.permissions.includes("org.facilities.write");
  const creating = canWrite && params.get("new") === "1";
  const [showArchived, setShowArchived] = useState(false);

  const facilities = useQuery({
    queryKey: ["org", slug, "facilities"],
    queryFn: () => apiFetch("/api/org/facilities", { schema: FacilitiesResponseSchema }),
  });
  const all = facilities.data?.facilities ?? [];
  const archived = all.filter((f) => f.status === "archived").length;
  const list = all.filter((f) => showArchived || f.status === "active");

  function setCreating(open: boolean) {
    const next = new URLSearchParams(params);
    if (open) next.set("new", "1");
    else next.delete("new");
    setParams(next, { replace: true });
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          canWrite ? (
            <Button action="add" onClick={() => setCreating(true)}>
              {t("new")}
            </Button>
          ) : null
        }
      />
      {facilities.isError ? <Alert kind="error">{t("loadError")}</Alert> : null}
      {facilities.data && all.length === 0 ? (
        <EmptyState
          icon={<Icon.MapPin weight="duotone" />}
          title={t("empty")}
          description={t("emptyHint")}
          action={
            canWrite ? (
              <Button action="add" onClick={() => setCreating(true)}>
                {t("new")}
              </Button>
            ) : undefined
          }
        />
      ) : null}
      {list.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((f) => (
            <li key={f.id}>
              <FacilityCard facility={f} to={paths.facility(f.id)} kindLabel={kinds(f.kind)} />
            </li>
          ))}
        </ul>
      ) : null}
      {archived > 0 ? (
        <div>
          <Button
            action={showArchived ? "hide" : "show"}
            variant="tertiary"
            size="sm"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? t("hideArchived") : t("showArchived", { count: archived })}
          </Button>
        </div>
      ) : null}
      {canWrite ? (
        <FacilitySheet open={creating} facility={null} onClose={() => setCreating(false)} />
      ) : null}
    </div>
  );
}

function FacilityCard({
  facility,
  to,
  kindLabel,
}: {
  facility: Facility;
  to: string;
  kindLabel: string;
}) {
  const t = useT("facilities");
  const openDays = new Set(facility.hours.map((h) => h.weekday)).size;
  return (
    <Link
      to={to}
      className="flex h-full flex-col gap-3 rounded-card bg-surface p-5 shadow-card transition-shadow hover:shadow-float precisa:border precisa:border-border"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-club-soft text-club-soft-text [&_svg]:size-6">
          {facilityIcon(facility.kind, 24)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body font-semibold text-ink">{facility.name}</span>
          <span className="text-secondary text-muted">
            {kindLabel}
            {facility.capacity ? ` · ${t("capacityShort", { count: facility.capacity })}` : ""}
          </span>
        </span>
        {facility.status === "archived" ? (
          <StatusChip kind="neutral">{t("archived")}</StatusChip>
        ) : null}
      </div>
      {facility.description ? (
        <p className="line-clamp-2 text-secondary text-muted">{facility.description}</p>
      ) : null}
      <dl className="mt-auto grid grid-cols-2 gap-3 text-secondary">
        <div className="flex flex-col">
          <dt className="text-label text-muted">{t("card.hours")}</dt>
          <dd className={openDays === 0 ? "text-warning" : "text-ink"}>
            {openDays === 0 ? t("card.noHours") : t("card.openDays", { count: openDays })}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-label text-muted">{t("card.thisWeek")}</dt>
          <dd className="text-ink">{t("card.events", { count: facility.eventsThisWeek })}</dd>
        </div>
      </dl>
    </Link>
  );
}

/** Alta o edición de una instalación. Con `facility`, edita; sin ella, crea y va a la ficha. */
export function FacilitySheet({
  open,
  facility,
  onClose,
  onSaved,
}: {
  open: boolean;
  facility: Facility | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const t = useT("facilities.sheet");
  const c = useT("common");
  const kinds = useT("facilityKinds");
  const errors = useT("errors");
  const toast = useToast();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [name, setName] = useState(facility?.name ?? "");
  // En un box (ADR 0050) las salas son de gimnasio: ni pistas, ni piscinas, ni campos.
  const fitness = useClubModel() === "fitness";
  const kindOptions: readonly FacilityKind[] = fitness ? ["gym", "room", "other"] : FACILITY_KINDS;
  const [kind, setKind] = useState<FacilityKind>(facility?.kind ?? (fitness ? "gym" : "court"));
  const [capacity, setCapacity] = useState(facility?.capacity ? String(facility.capacity) : "");
  const [description, setDescription] = useState(facility?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = FacilityCreateSchema.safeParse({
      name,
      kind,
      capacity: capacity.trim() ? Number(capacity) : null,
      description: description.trim() || null,
    });
    if (!parsed.success) {
      setError(errors("bad_request"));
      return;
    }
    setBusy(true);
    try {
      if (facility) {
        await apiFetch(`/api/org/facilities/${facility.id}`, {
          method: "PATCH",
          body: parsed.data,
          schema: FacilityResponseSchema,
        });
        toast("success", t("saved"));
        await client.invalidateQueries({ queryKey: ["org", slug, "facilities"] });
        onClose();
        onSaved?.();
      } else {
        const res = await apiFetch("/api/org/facilities", {
          method: "POST",
          body: parsed.data,
          schema: FacilityResponseSchema,
        });
        toast("success", t("created"));
        await client.invalidateQueries({ queryKey: ["org", slug, "facilities"] });
        onClose();
        onSaved?.();
        void navigate(paths.facility(res.facility.id));
      }
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
      title={facility ? t("editTitle") : t("title")}
      description={facility ? undefined : t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action={facility ? "save" : "add"}
            type="submit"
            form="facility-form"
            loading={busy}
          >
            {facility ? c("save") : t("submit")}
          </Button>
        </>
      }
    >
      <form id="facility-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("name")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("kind")}>
            {(id) => (
              <Select
                id={id}
                value={kind}
                onChange={(e) => setKind(e.target.value as FacilityKind)}
              >
                {[...new Set([...kindOptions, kind])].map((k) => (
                  <option key={k} value={k}>
                    {kinds(k)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("capacity")} hint={t("capacityHint")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={100000}
                inputMode="numeric"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label={t("descriptionField")}>
          {(id) => (
            <Input
              id={id}
              maxLength={400}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}
