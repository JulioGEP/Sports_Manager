import {
  BOX_EQUIPMENT_KINDS,
  EquipmentItemResponseSchema,
  type BoxEquipmentKind,
  type EquipmentItem,
} from "@sportsmanager/shared";
import { useState } from "react";
import { useStaffError } from "@/components/fitness/staff-ui";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useClassTime, useInvalidateFitness } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { useEquipment } from "@/lib/planning";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Input,
  PageHeader,
  Select,
  Sheet,
  StatusChip,
  useToast,
} from "@/ui";

interface Draft {
  kind: BoxEquipmentKind;
  name: string;
  quantity: string;
  outOfService: string;
  repairUntil: string;
  minKg: string;
  maxKg: string;
  facilityId: string;
  notes: string;
}

const EMPTY: Draft = {
  kind: "barbell",
  name: "",
  quantity: "1",
  outOfService: "0",
  repairUntil: "",
  minKg: "",
  maxKg: "",
  facilityId: "",
  notes: "",
};

const numberOrNull = (text: string) => {
  const v = Number(text.replace(",", "."));
  return text.trim() && Number.isFinite(v) ? v : null;
};

/**
 * El material del box (ADR 0053): cuántas unidades hay de cada cosa, sus pesos, en qué sala y lo
 * que está en reparación. Con esto el validador sabe si un WOD cabe en la clase y la IA no programa
 * con lo que no hay.
 */
export function EquipmentPage() {
  const t = useT("fitness.planning.equipment");
  const kinds = useT("fitness.exercises.equipment");
  const home = useT("fitness.planning.home");
  const time = useClassTime();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const equipment = useEquipment();
  const [editing, setEditing] = useState<EquipmentItem | "new" | null>(null);
  const items = equipment.data?.items ?? [];
  const canWrite = equipment.data?.canWrite ?? false;
  const machines = items
    .filter((i) => i.kind === "rower" || i.kind === "bike" || i.kind === "ski")
    .reduce((s, i) => s + i.availableToday, 0);
  const broken = items.filter((i) => i.availableToday < i.quantity);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backTo={paths.planning}
        backLabel={home("title")}
        title={t("title")}
        description={t("description")}
        actions={
          canWrite ? (
            <Button action="add" onClick={() => setEditing("new")}>
              {t("add")}
            </Button>
          ) : null
        }
      />
      {equipment.isError ? <Alert kind="error">{t("loadError")}</Alert> : null}
      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="flex flex-col rounded-card bg-surface px-4 py-3 shadow-card precisa:border precisa:border-border">
            <span className="font-mono text-title2 text-ink">{items.length}</span>
            <span className="text-secondary text-muted">{t("lines")}</span>
          </div>
          <div className="flex flex-col rounded-card bg-surface px-4 py-3 shadow-card precisa:border precisa:border-border">
            <span className="font-mono text-title2 text-ink">{machines}</span>
            <span className="text-secondary text-muted">{t("machines")}</span>
          </div>
          <div className="flex flex-col rounded-card bg-surface px-4 py-3 shadow-card precisa:border precisa:border-border">
            <span
              className={`font-mono text-title2 ${broken.length > 0 ? "text-warning" : "text-ink"}`}
            >
              {broken.length}
            </span>
            <span className="text-secondary text-muted">{t("broken")}</span>
          </div>
        </div>
      ) : null}

      {equipment.isPending ? <div className="h-64 animate-pulse rounded-card bg-raised" /> : null}
      {!equipment.isPending && items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon.Barbell size={28} aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={
              canWrite ? (
                <Button action="add" onClick={() => setEditing("new")}>
                  {t("add")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : null}

      {items.length > 0 ? (
        <Card padded={false}>
          <ul className="flex flex-col divide-y divide-line">
            {items.map((item) => (
              <li key={item.id} className="flex min-h-16 items-center gap-3 px-5 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-raised font-mono text-ink">
                  {item.availableToday}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-ink">{item.name}</span>
                  <span className="truncate text-secondary text-muted">
                    {[
                      kinds(item.kind),
                      item.minKg !== null || item.maxKg !== null
                        ? t("weights", { min: item.minKg ?? "", max: item.maxKg ?? "" })
                        : null,
                      item.facility?.name ?? null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {item.availableToday < item.quantity ? (
                  <StatusChip kind="warning">
                    {item.repairUntil
                      ? t("repairUntil", {
                          count: item.quantity - item.availableToday,
                          date: time.weekday(item.repairUntil, "short"),
                        })
                      : t("repair", { count: item.quantity - item.availableToday })}
                  </StatusChip>
                ) : (
                  <span className="text-secondary text-muted">
                    {t("units", { count: item.quantity })}
                  </span>
                )}
                {canWrite ? (
                  <IconButton
                    label={t("edit", { name: item.name })}
                    onClick={() => setEditing(item)}
                  >
                    <Icon.PencilSimple size={18} aria-hidden="true" />
                  </IconButton>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {editing ? (
        <EquipmentSheet
          item={editing === "new" ? null : editing}
          facilities={equipment.data?.facilities ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function EquipmentSheet({
  item,
  facilities,
  onClose,
}: {
  item: EquipmentItem | null;
  facilities: { id: string; name: string }[];
  onClose: () => void;
}) {
  const t = useT("fitness.planning.equipment");
  const kinds = useT("fitness.exercises.equipment");
  const c = useT("fitness.common");
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const errorText = useStaffError();
  const [draft, setDraft] = useState<Draft>(
    item
      ? {
          kind: item.kind as BoxEquipmentKind,
          name: item.name,
          quantity: String(item.quantity),
          outOfService: String(item.outOfService),
          repairUntil: item.repairUntil ?? "",
          minKg: item.minKg !== null ? String(item.minKg) : "",
          maxKg: item.maxKg !== null ? String(item.maxKg) : "",
          facilityId: item.facility?.id ?? "",
          notes: item.notes ?? "",
        }
      : EMPTY,
  );
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function save() {
    const quantity = Number(draft.quantity);
    const out = Number(draft.outOfService || "0");
    if (!draft.name.trim() || !Number.isInteger(quantity) || quantity < 0) {
      setError(t("invalid"));
      return;
    }
    if (!Number.isInteger(out) || out > quantity) {
      setError(t("invalidOut"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(item ? `/api/org/equipment/${item.id}` : "/api/org/equipment", {
        method: item ? "PUT" : "POST",
        body: {
          kind: draft.kind,
          name: draft.name.trim(),
          quantity,
          outOfService: out,
          repairUntil: out > 0 && draft.repairUntil ? draft.repairUntil : null,
          minKg: numberOrNull(draft.minKg),
          maxKg: numberOrNull(draft.maxKg),
          facilityId: draft.facilityId || null,
          notes: draft.notes.trim() || null,
        },
        schema: EquipmentItemResponseSchema,
      });
      await invalidate();
      toast("success", t("saved"));
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!item) return;
    try {
      await apiFetch(`/api/org/equipment/${item.id}`, { method: "DELETE" });
      await invalidate();
      toast("success", t("removed"));
      onClose();
    } catch (err) {
      toast("error", errorText(err));
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={item ? item.name : t("add")}
      footer={
        <>
          {item ? (
            <Button variant="ghost-danger" action="delete" onClick={() => setConfirm(true)}>
              {t("remove")}
            </Button>
          ) : null}
          <Button variant="tertiary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" loading={saving} onClick={() => void save()}>
            {c("save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {error ? (
          <div className="sm:col-span-2">
            <Alert kind="error">{error}</Alert>
          </div>
        ) : null}
        <Field label={t("kind")}>
          {(id) => (
            <Select
              id={id}
              value={draft.kind}
              onChange={(e) => {
                const kind = e.target.value as BoxEquipmentKind;
                setDraft((d) => ({ ...d, kind, name: d.name || kinds(kind) }));
              }}
            >
              {BOX_EQUIPMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {kinds(k)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("name")}>
          {(id) => (
            <Input
              id={id}
              maxLength={80}
              value={draft.name}
              placeholder={kinds(draft.kind)}
              onChange={(e) => set("name", e.target.value)}
            />
          )}
        </Field>
        <Field label={t("quantity")}>
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.quantity}
              onChange={(e) => set("quantity", e.target.value)}
            />
          )}
        </Field>
        <Field label={t("outOfService")} hint={t("outOfServiceHint")}>
          {(id, describedBy) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              aria-describedby={describedBy}
              value={draft.outOfService}
              onChange={(e) => set("outOfService", e.target.value)}
            />
          )}
        </Field>
        {Number(draft.outOfService) > 0 ? (
          <Field label={t("repairDate")} hint={t("repairDateHint")}>
            {(id, describedBy) => (
              <Input
                id={id}
                type="date"
                aria-describedby={describedBy}
                value={draft.repairUntil}
                onChange={(e) => set("repairUntil", e.target.value)}
              />
            )}
          </Field>
        ) : null}
        <Field label={t("minKg")}>
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={draft.minKg}
              onChange={(e) => set("minKg", e.target.value)}
            />
          )}
        </Field>
        <Field label={t("maxKg")}>
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={draft.maxKg}
              onChange={(e) => set("maxKg", e.target.value)}
            />
          )}
        </Field>
        {facilities.length > 0 ? (
          <Field label={t("facility")}>
            {(id) => (
              <Select
                id={id}
                value={draft.facilityId}
                onChange={(e) => set("facilityId", e.target.value)}
              >
                <option value="">{t("anyFacility")}</option>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <div className="sm:col-span-2">
          <Field label={t("notes")}>
            {(id) => (
              <Input
                id={id}
                maxLength={400}
                value={draft.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            )}
          </Field>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        title={t("removeTitle", { name: item?.name ?? "" })}
        body={t("removeBody")}
        confirmLabel={t("remove")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => {
          setConfirm(false);
          void remove();
        }}
        onCancel={() => setConfirm(false)}
      />
    </Sheet>
  );
}
