import {
  isOrderedSuggestion,
  isPublicSuggestion,
  orderRoadmap,
  PlatformSuggestionCreateSchema,
  PlatformSuggestionResponseSchema,
  PlatformSuggestionsResponseSchema,
  SUGGESTION_AREAS,
  SUGGESTION_BODY_MAX,
  SUGGESTION_PUBLIC_STATUSES,
  SUGGESTION_RESPONSE_MAX,
  SUGGESTION_STATUSES,
  SUGGESTION_TITLE_MAX,
  suggestionEtaOptions,
  type PlatformSuggestion,
  type PlatformSuggestionsResponse,
  type SuggestionArea,
  type SuggestionStatus,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { Link, useSearchParams } from "react-router";
import { SuggestionStatusChip, textareaClass, useEtaLabel } from "@/components/suggestions";
import { apiFetch, errorKey } from "@/lib/api";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  Card,
  DataList,
  Definitions,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  Sheet,
  Tabs,
  useToast,
  type RowAction,
} from "@/ui";

type Tab = "inbox" | "roadmap" | "released" | "closed";
const QUERY_KEY = ["platform", "suggestions"] as const;
const PATH = "/admin/suggestions";

const tabOf = (s: PlatformSuggestion): Tab =>
  s.status === "submitted"
    ? "inbox"
    : s.status === "released"
      ? "released"
      : s.status === "declined" || s.status === "merged"
        ? "closed"
        : "roadmap";

const publicTitleOf = (s: PlatformSuggestion) => s.publicTitle ?? s.title;

/**
 * Mejoras y hoja de ruta (ADR 0046), en el panel del negocio: lo que piden los clubes por revisar,
 * la hoja de ruta con su orden, lo que ya ha salido y lo cerrado. Revisar es publicar (en estudio,
 * planificada con fecha aproximada, en desarrollo, disponible), descartar o unir a otra, reescribir
 * la versión pública y contestar al club. El panel se abre por la dirección (`?review=`, `?new=1`).
 */
export function PlatformSuggestionsPage() {
  const t = useT("platform.suggestions");
  const c = useT("common");
  const errors = useT("errors");
  const areas = useT("suggestionAreas");
  const statuses = useT("suggestionStatus");
  const etaLabel = useEtaLabel();
  const intl = useIntl();
  const toast = useToast();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [moving, setMoving] = useState<string | null>(null);
  const tab =
    (["inbox", "roadmap", "released", "closed"] as const).find((k) => k === params.get("tab")) ??
    "inbox";
  const reviewId = params.get("review");
  const creating = params.get("new") === "1";

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () =>
      apiFetch("/api/platform/suggestions", {
        schema: PlatformSuggestionsResponseSchema,
        club: null,
      }),
  });
  const all = query.data?.suggestions ?? [];
  const count = (k: Tab) => all.filter((s) => tabOf(s) === k).length;
  const reviewing = reviewId ? (all.find((s) => s.id === reviewId) ?? null) : null;

  function go(next: { tab?: Tab; review?: string | null; new?: boolean }) {
    const sp = new URLSearchParams();
    const nextTab = next.tab ?? tab;
    if (nextTab !== "inbox") sp.set("tab", nextTab);
    if (next.review) sp.set("review", next.review);
    if (next.new) sp.set("new", "1");
    setParams(sp, { replace: !(next.review || next.new) });
  }
  const hrefOf = (s: PlatformSuggestion) =>
    `${PATH}?${new URLSearchParams({ ...(tab !== "inbox" ? { tab } : {}), review: s.id })}`;
  const when = (iso: string | null) =>
    iso ? intl.formatDate(new Date(iso), { dateStyle: "medium" }) : "";

  const ordered = orderRoadmap(all);
  const coming = ordered.filter((s) => s.rank !== null);
  const open = ordered.filter((s) => s.status === "open");

  /** Sube o baja una mejora dentro de su grupo (en desarrollo o planificada). */
  async function move(s: PlatformSuggestion, delta: -1 | 1) {
    const index = coming.findIndex((x) => x.id === s.id);
    const other = coming[index + delta];
    if (!other || other.status !== s.status) return;
    const ids = coming.map((x) => x.id);
    [ids[index], ids[index + delta]] = [ids[index + delta]!, ids[index]!];
    setMoving(s.id);
    try {
      const res = await apiFetch("/api/platform/suggestions/order", {
        method: "PUT",
        body: { ids },
        schema: PlatformSuggestionsResponseSchema,
        club: null,
      });
      client.setQueryData<PlatformSuggestionsResponse>(QUERY_KEY, res);
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setMoving(null);
    }
  }
  const moveActions = (s: PlatformSuggestion): RowAction[] => {
    const index = coming.findIndex((x) => x.id === s.id);
    const actions: RowAction[] = [];
    if (coming[index - 1]?.status === s.status)
      actions.push({
        key: "up",
        label: t("moveUp"),
        icon: <Icon.ArrowUp size={18} aria-hidden="true" />,
        onClick: () => void move(s, -1),
        loading: moving === s.id,
      });
    if (coming[index + 1]?.status === s.status)
      actions.push({
        key: "down",
        label: t("moveDown"),
        icon: <Icon.ArrowDown size={18} aria-hidden="true" />,
        onClick: () => void move(s, 1),
        loading: moving === s.id,
      });
    return actions;
  };

  const titleCell = (s: PlatformSuggestion) => (
    <span className="flex min-w-0 flex-col">
      <Link to={hrefOf(s)} className="font-medium text-ink">
        {isPublicSuggestion(s.status) ? publicTitleOf(s) : s.title}
      </Link>
      <span className="text-secondary text-muted">
        {[areas(s.area), s.organization?.name ?? t("fromPlatform")].join(" · ")}
      </span>
    </span>
  );
  const empty = (title: string) => (
    <EmptyState
      icon={<Icon.Lightbulb weight="duotone" />}
      title={query.isPending ? c("loading") : title}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button action="add" onClick={() => go({ new: true })}>
            {t("create")}
          </Button>
        }
      />
      {query.isError ? <Alert kind="error">{errors(errorKey(query.error))}</Alert> : null}
      <Tabs<Tab>
        label={t("title")}
        selected={tab}
        onChange={(key) => go({ tab: key })}
        items={(["inbox", "roadmap", "released", "closed"] as const).map((key) => ({
          key,
          label: t(`tabs.${key}`),
          count: query.data ? count(key) : undefined,
        }))}
      />

      {tab === "inbox" ? (
        <Card padded={false}>
          <DataList<PlatformSuggestion>
            caption={t("tabs.inbox")}
            rows={all.filter((s) => s.status === "submitted")}
            getKey={(s) => s.id}
            href={hrefOf}
            empty={empty(t("emptyInbox"))}
            columns={[
              { key: "title", header: t("table.suggestion"), cell: titleCell },
              {
                key: "author",
                header: t("table.author"),
                cell: (s) => s.createdBy?.name ?? "",
              },
              { key: "sent", header: t("table.sent"), cell: (s) => when(s.createdAt) },
            ]}
            mobileRow={(s) => ({
              title: s.title,
              subtitle: [s.organization?.name, when(s.createdAt)].filter(Boolean).join(" · "),
              trailing: <SuggestionStatusChip status={s.status} />,
            })}
          />
        </Card>
      ) : null}

      {tab === "roadmap" ? (
        <>
          <Card title={t("coming")} description={t("comingHint")} padded={false}>
            <DataList<PlatformSuggestion & { rank: number | null }>
              caption={t("coming")}
              rows={coming}
              getKey={(s) => s.id}
              href={hrefOf}
              rowActions={moveActions}
              empty={empty(t("emptyComing"))}
              columns={[
                {
                  key: "rank",
                  header: t("table.rank"),
                  cell: (s) => <span className="font-mono">{s.rank}</span>,
                },
                { key: "title", header: t("table.improvement"), cell: titleCell },
                {
                  key: "status",
                  header: t("table.status"),
                  cell: (s) => <SuggestionStatusChip status={s.status} />,
                },
                {
                  key: "eta",
                  header: t("table.eta"),
                  cell: (s) => etaLabel(s.eta) ?? <span className="text-muted">{t("noEta")}</span>,
                },
                { key: "votes", header: t("table.votes"), cell: (s) => s.votes, numeric: true },
              ]}
              mobileRow={(s) => ({
                title: `${s.rank}. ${publicTitleOf(s)}`,
                subtitle: [
                  statuses(s.status),
                  etaLabel(s.eta) ?? t("noEta"),
                  t("votes", { count: s.votes }),
                ].join(" · "),
              })}
            />
          </Card>
          <Card title={t("open")} description={t("openHint")} padded={false}>
            <DataList<PlatformSuggestion>
              caption={t("open")}
              rows={open}
              getKey={(s) => s.id}
              href={hrefOf}
              empty={empty(t("emptyOpen"))}
              columns={[
                { key: "title", header: t("table.improvement"), cell: titleCell },
                { key: "votes", header: t("table.votes"), cell: (s) => s.votes, numeric: true },
                {
                  key: "merged",
                  header: t("table.merged"),
                  cell: (s) => s.mergedCount,
                  numeric: true,
                },
                {
                  key: "published",
                  header: t("table.published"),
                  cell: (s) => when(s.publishedAt),
                },
              ]}
              mobileRow={(s) => ({
                title: publicTitleOf(s),
                subtitle: t("votes", { count: s.votes }),
              })}
            />
          </Card>
        </>
      ) : null}

      {tab === "released" || tab === "closed" ? (
        <Card padded={false}>
          <DataList<PlatformSuggestion>
            caption={t(`tabs.${tab}`)}
            rows={all
              .filter((s) => tabOf(s) === tab)
              .sort((a, b) =>
                tab === "released"
                  ? (b.releasedAt ?? "").localeCompare(a.releasedAt ?? "")
                  : (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""),
              )}
            getKey={(s) => s.id}
            href={hrefOf}
            empty={empty(tab === "released" ? t("emptyReleased") : t("emptyClosed"))}
            columns={[
              { key: "title", header: t("table.suggestion"), cell: titleCell },
              {
                key: "status",
                header: t("table.status"),
                cell: (s) =>
                  s.status === "merged" && s.mergedInto ? (
                    <span className="flex flex-col gap-1">
                      <SuggestionStatusChip status={s.status} />
                      <span className="text-secondary text-muted">{s.mergedInto.title}</span>
                    </span>
                  ) : (
                    <SuggestionStatusChip status={s.status} />
                  ),
              },
              { key: "votes", header: t("table.votes"), cell: (s) => s.votes, numeric: true },
              {
                key: "when",
                header: tab === "released" ? t("table.released") : t("table.reviewed"),
                cell: (s) => when(tab === "released" ? s.releasedAt : s.reviewedAt),
              },
            ]}
            mobileRow={(s) => ({
              title: isPublicSuggestion(s.status) ? publicTitleOf(s) : s.title,
              subtitle: when(tab === "released" ? s.releasedAt : s.reviewedAt),
              trailing: <SuggestionStatusChip status={s.status} />,
            })}
          />
        </Card>
      ) : null}

      {reviewing ? (
        <ReviewSheet
          key={reviewing.id}
          suggestion={reviewing}
          all={all}
          onClose={() => go({})}
          onSaved={(saved) => go({ tab: tabOf(saved) })}
        />
      ) : null}
      {creating ? (
        <CreateSheet onClose={() => go({})} onCreated={(s) => go({ tab: tabOf(s) })} />
      ) : null}
    </div>
  );
}

/** Selector de fecha aproximada: sin fecha, los próximos trimestres o los próximos meses. */
function EtaSelect({
  id,
  value,
  onChange,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string | undefined;
}) {
  const t = useT("platform.suggestions");
  const etaLabel = useEtaLabel();
  const { quarters, months } = suggestionEtaOptions(new Date().toISOString().slice(0, 10));
  const known = value === "" || quarters.includes(value) || months.includes(value);
  return (
    <Select
      id={id}
      aria-describedby={describedBy}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{t("noEta")}</option>
      {known ? null : <option value={value}>{etaLabel(value)}</option>}
      <optgroup label={t("quarters")}>
        {quarters.map((q) => (
          <option key={q} value={q}>
            {etaLabel(q)}
          </option>
        ))}
      </optgroup>
      <optgroup label={t("months")}>
        {months.map((m) => (
          <option key={m} value={m}>
            {etaLabel(m)}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}

function ReviewSheet({
  suggestion: s,
  all,
  onClose,
  onSaved,
}: {
  suggestion: PlatformSuggestion;
  all: PlatformSuggestion[];
  onClose: () => void;
  onSaved: (saved: PlatformSuggestion) => void;
}) {
  const t = useT("platform.suggestions");
  const f = useT("platform.suggestions.form");
  const c = useT("common");
  const errors = useT("errors");
  const statuses = useT("suggestionStatus");
  const areas = useT("suggestionAreas");
  const intl = useIntl();
  const toast = useToast();
  const client = useQueryClient();
  const [form, setForm] = useState({
    status: s.status,
    publicTitle: publicTitleOf(s),
    publicBody: s.publicBody ?? s.body,
    area: s.area,
    eta: s.eta ?? "",
    response: s.response ?? "",
    mergedIntoId: s.mergedInto?.id ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targets = all
    .filter((x) => x.id !== s.id && x.status !== "merged")
    .sort(
      (a, b) =>
        Number(isPublicSuggestion(b.status)) - Number(isPublicSuggestion(a.status)) ||
        publicTitleOf(a).localeCompare(publicTitleOf(b)),
    );
  const publishing = isPublicSuggestion(form.status);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.status === "merged" && !form.mergedIntoId) {
      setError(f("mergeRequired"));
      return;
    }
    if (form.publicTitle.trim().length < 3) {
      setError(f("titleRequired"));
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/platform/suggestions/${s.id}`, {
        method: "PATCH",
        body: {
          status: form.status,
          publicTitle: form.publicTitle,
          publicBody: form.publicBody.trim() || null,
          area: form.area,
          eta: form.eta || null,
          ...(s.organization ? { response: form.response.trim() || null } : {}),
          ...(form.status === "merged" ? { mergedIntoId: form.mergedIntoId } : {}),
        },
        schema: PlatformSuggestionResponseSchema,
        club: null,
      });
      await client.invalidateQueries({ queryKey: QUERY_KEY });
      toast("success", t("saved", { status: statuses(res.suggestion.status).toLowerCase() }));
      onSaved(res.suggestion);
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
      title={f("title")}
      description={
        s.organization ? f("fromClub", { club: s.organization.name }) : t("fromPlatform")
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" type="submit" form="review-form" loading={busy}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="review-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {error ? <Alert kind="error">{error}</Alert> : null}
        {s.organization ? (
          <section className="flex flex-col gap-2 rounded-card border border-line bg-raised p-3">
            <h3 className="text-secondary font-medium text-muted">{f("original")}</h3>
            <strong className="text-body text-ink">{s.title}</strong>
            <p className="whitespace-pre-line text-body text-ink">{s.body}</p>
            <p className="text-secondary text-muted">
              {f("sentBy", {
                name: s.createdBy ? `${s.createdBy.name} (${s.createdBy.email})` : "",
                date: intl.formatDate(new Date(s.createdAt), { dateStyle: "long" }),
              })}
            </p>
          </section>
        ) : null}
        <Definitions
          items={[
            { term: t("table.votes"), detail: t("votes", { count: s.votes }) },
            ...(s.mergedCount > 0
              ? [{ term: t("table.merged"), detail: String(s.mergedCount) }]
              : []),
            ...(s.reviewedBy
              ? [
                  {
                    term: t("table.reviewed"),
                    detail: `${s.reviewedBy} · ${s.reviewedAt ? intl.formatDate(new Date(s.reviewedAt), { dateStyle: "medium" }) : ""}`,
                  },
                ]
              : []),
          ]}
        />
        <Field label={f("status")} hint={f(`statusHint.${form.status}`)}>
          {(id, describedBy) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as SuggestionStatus })}
            >
              {SUGGESTION_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {statuses(st)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {form.status === "merged" ? (
          <Field label={f("mergeInto")} hint={f("mergeHint")}>
            {(id, describedBy) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={form.mergedIntoId}
                onChange={(e) => setForm({ ...form, mergedIntoId: e.target.value })}
              >
                <option value="" disabled>
                  {f("mergePlaceholder")}
                </option>
                {targets.map((x) => (
                  <option key={x.id} value={x.id}>
                    {`${publicTitleOf(x)} · ${statuses(x.status)}`}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field label={f("publicTitle")} hint={publishing ? f("publicHint") : f("publicLater")}>
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              maxLength={SUGGESTION_TITLE_MAX}
              value={form.publicTitle}
              onChange={(e) => setForm({ ...form, publicTitle: e.target.value })}
            />
          )}
        </Field>
        <Field label={f("publicBody")}>
          {(id) => (
            <textarea
              id={id}
              rows={4}
              maxLength={SUGGESTION_BODY_MAX}
              className={textareaClass}
              value={form.publicBody}
              onChange={(e) => setForm({ ...form, publicBody: e.target.value })}
            />
          )}
        </Field>
        <div className="grid gap-4 precisa:grid-cols-2">
          <Field label={f("area")}>
            {(id) => (
              <Select
                id={id}
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value as SuggestionArea })}
              >
                {SUGGESTION_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {areas(a)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label={f("eta")}
            hint={isOrderedSuggestion(form.status) ? f("etaHint") : undefined}
          >
            {(id, describedBy) => (
              <EtaSelect
                id={id}
                describedBy={describedBy}
                value={form.eta}
                onChange={(eta) => setForm({ ...form, eta })}
              />
            )}
          </Field>
        </div>
        {s.organization ? (
          <Field label={f("response")} hint={f("responseHint", { club: s.organization.name })}>
            {(id, describedBy) => (
              <textarea
                id={id}
                aria-describedby={describedBy}
                rows={3}
                maxLength={SUGGESTION_RESPONSE_MAX}
                className={textareaClass}
                value={form.response}
                onChange={(e) => setForm({ ...form, response: e.target.value })}
              />
            )}
          </Field>
        ) : null}
      </form>
    </Sheet>
  );
}

function CreateSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (created: PlatformSuggestion) => void;
}) {
  const t = useT("platform.suggestions");
  const f = useT("platform.suggestions.form");
  const c = useT("common");
  const errors = useT("errors");
  const statuses = useT("suggestionStatus");
  const areas = useT("suggestionAreas");
  const toast = useToast();
  const client = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    body: "",
    area: "" as SuggestionArea | "",
    status: "open" as (typeof SUGGESTION_PUBLIC_STATUSES)[number],
    eta: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = PlatformSuggestionCreateSchema.safeParse({ ...form, eta: form.eta || null });
    if (!parsed.success) {
      setError(f("invalid"));
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/platform/suggestions", {
        method: "POST",
        body: parsed.data,
        schema: PlatformSuggestionResponseSchema,
        club: null,
      });
      await client.invalidateQueries({ queryKey: QUERY_KEY });
      toast("success", t("created"));
      onCreated(res.suggestion);
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
      title={t("create")}
      description={t("createHint")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="add" type="submit" form="create-suggestion-form" loading={busy}>
            {t("createSubmit")}
          </Button>
        </>
      }
    >
      <form
        id="create-suggestion-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => void submit(e)}
      >
        {error ? <Alert kind="error">{error}</Alert> : null}
        <Field label={f("publicTitle")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={SUGGESTION_TITLE_MAX}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          )}
        </Field>
        <Field label={f("publicBody")}>
          {(id) => (
            <textarea
              id={id}
              rows={4}
              maxLength={SUGGESTION_BODY_MAX}
              className={textareaClass}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          )}
        </Field>
        <div className="grid gap-4 precisa:grid-cols-2">
          <Field label={f("area")}>
            {(id) => (
              <Select
                id={id}
                required
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value as SuggestionArea })}
              >
                <option value="" disabled>
                  {f("areaPlaceholder")}
                </option>
                {SUGGESTION_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {areas(a)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={f("status")}>
            {(id) => (
              <Select
                id={id}
                value={form.status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: e.target.value as (typeof SUGGESTION_PUBLIC_STATUSES)[number],
                  })
                }
              >
                {SUGGESTION_PUBLIC_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {statuses(st)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={f("eta")}>
          {(id) => (
            <EtaSelect id={id} value={form.eta} onChange={(eta) => setForm({ ...form, eta })} />
          )}
        </Field>
      </form>
    </Sheet>
  );
}
