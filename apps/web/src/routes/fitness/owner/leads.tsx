import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  LeadConvertSchema,
  LeadCreateSchema,
  LeadResponseSchema,
  LeadUpdateSchema,
  type Lead,
  type LeadSource,
  type LeadStatus,
} from "@sportsmanager/shared";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { money } from "@/components/fees";
import {
  CheckField,
  useEntitlementLabel,
  useFeePlans,
  useInvalidateOwner,
} from "@/components/fitness/owner-ui";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import {
  dayRange,
  todayInClub,
  useClasses,
  useClassTime,
  useClubTimezone,
  useLeads,
} from "@/lib/fitness";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  DataList,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  Sheet,
  StatusChip,
  Tabs,
  useToast,
  type RowAction,
  type StatusKind,
} from "@/ui";

const LEAD_TONE: Record<LeadStatus, StatusKind> = {
  new: "info",
  trial_booked: "club",
  trial_done: "warning",
  converted: "success",
  lost: "neutral",
};

type Filter = "all" | LeadStatus;

/**
 * Leads del box (ADR 0049): quien se interesa (en la puerta, recomendado, por redes o desde la web
 * del box), su clase de prueba y en qué punto está. De aquí sale el atleta con su tarifa.
 */
export function LeadsPage() {
  const t = useT("fitness.owner.leads");
  const statuses = useT("fitness.owner.leads.status");
  const sources = useT("fitness.owner.leads.source");
  const { slug, org } = useReadyClub();
  const paths = clubPaths(slug);
  const navigate = useNavigate();
  const time = useClassTime();
  const { day } = useDates();
  const canWrite = org.actor.permissions.includes("org.club_members.write");
  const leads = useLeads();
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [converting, setConverting] = useState<Lead | null>(null);
  const all = leads.data?.leads ?? [];
  const rows = filter === "all" ? all : all.filter((l) => l.status === filter);
  const count = (s: LeadStatus) => all.filter((l) => l.status === s).length;
  const contact = (l: Lead) => [l.email, l.phone].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          canWrite ? (
            <Button action="add" onClick={() => setCreating(true)}>
              {t("new")}
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {LEAD_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filter === s}
            onClick={() => setFilter(filter === s ? "all" : s)}
            className={`flex flex-col items-start gap-1 rounded-card p-4 text-left shadow-card precisa:border precisa:border-border ${
              filter === s
                ? "bg-club-soft text-club-soft-text"
                : "bg-surface text-ink hover:bg-raised"
            }`}
          >
            <span className="font-mono text-title2">{count(s)}</span>
            <span className="text-secondary">{statuses(s)}</span>
          </button>
        ))}
      </div>

      <Tabs<Filter>
        label={t("filterLabel")}
        selected={filter}
        onChange={setFilter}
        items={[
          { key: "all", label: t("all"), count: all.length },
          ...LEAD_STATUSES.map((s) => ({ key: s, label: statuses(s), count: count(s) })),
        ]}
      />

      {leads.isError ? <Alert kind="error">{t("loadError")}</Alert> : null}

      <DataList<Lead>
        caption={t("caption")}
        columns={[
          {
            key: "name",
            header: t("table.name"),
            cell: (l) => (
              <span className="flex flex-col">
                <span className="font-medium text-ink">{`${l.firstName} ${l.lastName}`}</span>
                <span className="text-label text-muted">{contact(l)}</span>
              </span>
            ),
          },
          { key: "source", header: t("table.source"), cell: (l) => sources(l.source) },
          {
            key: "trial",
            header: t("table.trial"),
            cell: (l) => (l.trialClass ? time.when(l.trialClass.startsAt) : "–"),
          },
          {
            key: "status",
            header: t("table.status"),
            cell: (l) => <StatusChip kind={LEAD_TONE[l.status]}>{statuses(l.status)}</StatusChip>,
          },
          {
            key: "created",
            header: t("table.created"),
            cell: (l) => day(l.createdAt.slice(0, 10)),
          },
        ]}
        rows={rows}
        getKey={(l) => l.id}
        href={(l) => (l.convertedPlayerId ? paths.athleteFile(l.convertedPlayerId) : undefined)}
        mobileRow={(l) => ({
          title: `${l.firstName} ${l.lastName}`,
          subtitle: l.trialClass
            ? `${sources(l.source)} · ${time.when(l.trialClass.startsAt)}`
            : `${sources(l.source)} · ${contact(l)}`,
          trailing: <StatusChip kind={LEAD_TONE[l.status]}>{statuses(l.status)}</StatusChip>,
        })}
        rowActions={
          canWrite
            ? (l): RowAction[] =>
                l.convertedPlayerId
                  ? [
                      {
                        key: "open",
                        label: t("openAthlete"),
                        action: "open",
                        to: paths.athleteFile(l.convertedPlayerId),
                      },
                    ]
                  : [
                      {
                        key: "edit",
                        label: t("edit"),
                        action: "edit",
                        onClick: () => setEditing(l),
                      },
                      {
                        key: "convert",
                        label: t("convert"),
                        action: "approve",
                        tone: "primary",
                        onClick: () => setConverting(l),
                      },
                    ]
            : undefined
        }
        empty={
          <EmptyState
            icon={<Icon.UserPlus weight="duotone" />}
            title={filter === "all" ? t("empty") : t("emptyFilter")}
            description={filter === "all" ? t("emptyHint") : undefined}
            action={
              canWrite && filter === "all" ? (
                <Button action="add" onClick={() => setCreating(true)}>
                  {t("new")}
                </Button>
              ) : undefined
            }
          />
        }
      />

      <WebFormCard />

      {creating ? <LeadSheet lead={null} onClose={() => setCreating(false)} /> : null}
      {editing ? <LeadSheet lead={editing} onClose={() => setEditing(null)} /> : null}
      {converting ? (
        <ConvertSheet
          lead={converting}
          onClose={() => setConverting(null)}
          onConverted={(playerId) => {
            setConverting(null);
            void navigate(paths.athleteFile(playerId));
          }}
        />
      ) : null}
    </div>
  );
}

/** Las próximas clases (dos semanas) para elegir la de prueba. */
function useTrialClasses() {
  const timezone = useClubTimezone();
  return useClasses(dayRange(timezone, todayInClub(timezone), 14));
}

function LeadSheet({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const t = useT("fitness.owner.leads");
  const statuses = useT("fitness.owner.leads.status");
  const sources = useT("fitness.owner.leads.source");
  const errors = useT("errors");
  const toast = useToast();
  const time = useClassTime();
  const invalidate = useInvalidateOwner();
  const classes = useTrialClasses();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState<LeadSource>("walk_in");
  const [status, setStatus] = useState<LeadStatus>(lead?.status ?? "new");
  const [notes, setNotes] = useState(lead?.notes ?? "");
  const [trialEventId, setTrialEventId] = useState(lead?.trialClass?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upcoming = (classes.data?.classes ?? []).filter((c) => Date.parse(c.startsAt) > Date.now());

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = lead
      ? LeadUpdateSchema.safeParse({
          status,
          notes: notes.trim() || null,
          trialEventId: trialEventId || null,
        })
      : LeadCreateSchema.safeParse({
          firstName,
          lastName,
          email: email.trim() || null,
          phone: phone.trim() || null,
          source,
          notes: notes.trim() || null,
          trialEventId: trialEventId || null,
        });
    if (!parsed.success) {
      setError(lead ? t("sheet.invalid") : t("sheet.contactRequired"));
      return;
    }
    setBusy(true);
    try {
      await apiFetch(lead ? `/api/org/leads/${lead.id}` : "/api/org/leads", {
        method: lead ? "PATCH" : "POST",
        body: parsed.data,
        schema: LeadResponseSchema,
      });
      toast("success", lead ? t("sheet.saved") : t("sheet.created"));
      void invalidate();
      onClose();
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
      closeLabel={t("close")}
      title={lead ? `${lead.firstName} ${lead.lastName}` : t("sheet.title")}
      description={lead ? undefined : t("sheet.description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" form="lead-form" action={lead ? "save" : "add"} loading={busy}>
            {lead ? t("save") : t("sheet.submit")}
          </Button>
        </>
      }
    >
      <form id="lead-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {lead ? (
          <Field label={t("sheet.status")}>
            {(id) => (
              <Select
                id={id}
                value={status}
                onChange={(e) => setStatus(e.target.value as LeadStatus)}
              >
                {LEAD_STATUSES.filter((s) => s !== "converted").map((s) => (
                  <option key={s} value={s}>
                    {statuses(s)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("sheet.firstName")}>
                {(id) => (
                  <Input
                    id={id}
                    required
                    maxLength={60}
                    autoComplete="off"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t("sheet.lastName")}>
                {(id) => (
                  <Input
                    id={id}
                    required
                    maxLength={80}
                    autoComplete="off"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("sheet.email")}>
                {(id) => (
                  <Input
                    id={id}
                    type="email"
                    autoComplete="off"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t("sheet.phone")}>
                {(id) => (
                  <Input
                    id={id}
                    type="tel"
                    autoComplete="off"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <Field label={t("sheet.source")}>
              {(id) => (
                <Select
                  id={id}
                  value={source}
                  onChange={(e) => setSource(e.target.value as LeadSource)}
                >
                  {LEAD_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {sources(s)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </>
        )}
        <Field label={t("sheet.trial")} hint={t("sheet.trialHint")}>
          {(id, describedBy) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={trialEventId}
              onChange={(e) => setTrialEventId(e.target.value)}
            >
              <option value="">{t("sheet.noTrial")}</option>
              {lead?.trialClass && !upcoming.some((c) => c.id === lead.trialClass?.id) ? (
                <option value={lead.trialClass.id}>
                  {`${time.when(lead.trialClass.startsAt)} · ${lead.trialClass.title}`}
                </option>
              ) : null}
              {upcoming.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${time.when(c.startsAt)} · ${c.team?.name ?? c.title}`}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("sheet.notes")}>
          {(id) => (
            <textarea
              id={id}
              rows={3}
              maxLength={1000}
              className="w-full rounded-field border border-control bg-surface px-4 py-3 text-body text-ink outline-none focus:border-2 focus:border-club focus:shadow-[0_0_0_4px_var(--club-soft)]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

function ConvertSheet({
  lead,
  onClose,
  onConverted,
}: {
  lead: Lead;
  onClose: () => void;
  onConverted: (playerId: string) => void;
}) {
  const t = useT("fitness.owner.leads.convertSheet");
  const l = useT("fitness.owner.leads");
  const errors = useT("errors");
  const toast = useToast();
  const timezone = useClubTimezone();
  const { org } = useReadyClub();
  const canFees = org.actor.permissions.includes("org.fees.write");
  const plans = useFeePlans(canFees);
  const entitlement = useEntitlementLabel();
  const invalidate = useInvalidateOwner();
  const [feePlanId, setFeePlanId] = useState("");
  const [startsOn, setStartsOn] = useState(todayInClub(timezone));
  const [chargeNow, setChargeNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = LeadConvertSchema.safeParse(
      feePlanId ? { feePlanId, startsOn, chargeNow } : { startsOn },
    );
    if (!parsed.success) {
      setError(l("sheet.invalid"));
      return;
    }
    setBusy(true);
    try {
      const out = await apiFetch(`/api/org/leads/${lead.id}/convert`, {
        method: "POST",
        body: parsed.data,
        schema: LeadResponseSchema,
      });
      toast("success", t("done", { name: `${lead.firstName} ${lead.lastName}` }));
      void invalidate();
      if (out.lead.convertedPlayerId) onConverted(out.lead.convertedPlayerId);
      else onClose();
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
      closeLabel={l("close")}
      title={t("title", { name: `${lead.firstName} ${lead.lastName}` })}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {l("cancel")}
          </Button>
          <Button type="submit" form="convert-lead-form" action="approve" loading={busy}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="convert-lead-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {canFees ? (
          <Field label={t("plan")} hint={t("planHint")}>
            {(id, describedBy) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={feePlanId}
                onChange={(e) => setFeePlanId(e.target.value)}
              >
                <option value="">{t("noPlan")}</option>
                {(plans.data?.plans ?? [])
                  .filter((p) => p.status === "active")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {`${p.name} · ${entitlement(p)} · ${money(p.amountCents)}`}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field label={t("startsOn")}>
          {(id) => (
            <Input
              id={id}
              type="date"
              required
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
            />
          )}
        </Field>
        {feePlanId ? (
          <CheckField
            label={t("chargeNow")}
            hint={t("chargeNowHint")}
            checked={chargeNow}
            onChange={setChargeNow}
          />
        ) : null}
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

/** Cómo llevar la clase de prueba a la web del box con la API pública y la clave publicable. */
function WebFormCard() {
  const t = useT("fitness.owner.leads.web");
  const { slug, org } = useReadyClub();
  const paths = clubPaths(slug);
  const canSettings = org.actor.permissions.includes("org.settings.write");
  return (
    <Card
      title={t("title")}
      description={t("description")}
      actions={
        canSettings ? (
          <ButtonLink to={`${paths.settings}?tab=developers`} variant="secondary" action="open">
            {t("openKey")}
          </ButtonLink>
        ) : undefined
      }
    >
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-body text-muted">
        <li>{t("step1")}</li>
        <li>{t("step2")}</li>
        <li>{t("step3")}</li>
      </ol>
      <pre className="mt-4 overflow-x-auto rounded-field bg-raised p-3 font-mono text-secondary text-ink">
        {`GET  /api/public/v1/classes?key=pk_…&days=7
POST /api/public/v1/trials?key=pk_…
{ "firstName", "lastName", "email", "phone", "eventId", "consent": true }`}
      </pre>
    </Card>
  );
}
