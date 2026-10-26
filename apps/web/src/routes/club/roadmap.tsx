import {
  ClubSuggestionResponseSchema,
  ClubSuggestionsResponseSchema,
  isVotableSuggestion,
  RoadmapItemResponseSchema,
  RoadmapResponseSchema,
  similarSuggestions,
  SUGGESTION_AREAS,
  SUGGESTION_BODY_MAX,
  SUGGESTION_TITLE_MAX,
  SuggestionCreateSchema,
  type ClubSuggestion,
  type RoadmapItem,
  type RoadmapResponse,
  type SuggestionArea,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { Link, useSearchParams } from "react-router";
import { SuggestionStatusChip, textareaClass, useEtaLabel } from "@/components/suggestions";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
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
  StatusChip,
  Tabs,
  useToast,
  type RowAction,
} from "@/ui";

type Tab = "roadmap" | "mine";

/**
 * Mejoras de la plataforma (ADR 0046), para la administración del club: la hoja de ruta (lo que
 * se está haciendo, lo que viene en orden y con fecha aproximada, lo que está en estudio para
 * votar y lo último que ha salido), las sugerencias del club con su estado y la respuesta de la
 * plataforma, y el formulario para sugerir otra. Lo que se abre va en la dirección (`?item=`,
 * `?mine=`, `?new=1`): la paleta de mandos y los enlaces llegan directos.
 */
export function RoadmapPage() {
  const t = useT("roadmap");
  const errors = useT("errors");
  const { org, slug } = useReadyClub();
  const [params, setParams] = useSearchParams();
  const allowed = org.actor.permissions.includes("org.suggestions");
  const tab: Tab = params.get("tab") === "mine" ? "mine" : "roadmap";
  const itemId = params.get("item");
  const mineId = params.get("mine");
  const creating = params.get("new") === "1";

  const roadmap = useQuery({
    queryKey: ["org", slug, "roadmap"],
    queryFn: () => apiFetch("/api/org/roadmap", { schema: RoadmapResponseSchema }),
    enabled: allowed,
  });
  const mine = useQuery({
    queryKey: ["org", slug, "suggestions"],
    queryFn: () => apiFetch("/api/org/suggestions", { schema: ClubSuggestionsResponseSchema }),
    enabled: allowed,
  });

  /** Cambia la dirección sin perder la pestaña: abrir y cerrar paneles no apila historial al cerrar. */
  function go(next: { tab?: Tab; item?: string | null; mine?: string | null; new?: boolean }) {
    const sp = new URLSearchParams();
    const nextTab = next.tab ?? tab;
    if (nextTab === "mine") sp.set("tab", "mine");
    if (next.item) sp.set("item", next.item);
    if (next.mine) sp.set("mine", next.mine);
    if (next.new) sp.set("new", "1");
    const opening = Boolean(next.item || next.mine || next.new);
    setParams(sp, { replace: !opening });
  }

  if (!allowed) return <Alert kind="warning">{t("onlyAdmins")}</Alert>;

  const items = roadmap.data?.items ?? [];
  const suggestions = mine.data?.suggestions ?? [];
  const openItem = itemId ? (items.find((i) => i.id === itemId) ?? null) : null;
  const openMine = mineId ? (suggestions.find((s) => s.id === mineId) ?? null) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button action="add" onClick={() => go({ new: true })}>
            {t("suggest")}
          </Button>
        }
      />
      <Tabs<Tab>
        label={t("title")}
        selected={tab}
        onChange={(key) => go({ tab: key })}
        items={[
          { key: "roadmap", label: t("tabs.roadmap") },
          { key: "mine", label: t("tabs.mine"), count: mine.data ? suggestions.length : undefined },
        ]}
      />
      {roadmap.isError ? <Alert kind="error">{errors(errorKey(roadmap.error))}</Alert> : null}
      {mine.isError ? <Alert kind="error">{errors(errorKey(mine.error))}</Alert> : null}
      {tab === "roadmap" ? (
        <RoadmapTab
          items={items}
          loading={roadmap.isPending}
          hrefOf={(id) => `${clubPaths(slug).roadmap}?item=${id}`}
        />
      ) : (
        <MineTab
          suggestions={suggestions}
          loading={mine.isPending}
          hrefOf={(id) => `${clubPaths(slug).roadmap}?tab=mine&mine=${id}`}
          onCreate={() => go({ new: true })}
        />
      )}
      <RoadmapItemSheet item={openItem} onClose={() => go({})} />
      <MineSheet
        suggestion={openMine}
        onClose={() => go({})}
        onOpenItem={(id) => go({ tab: "roadmap", item: id })}
      />
      {creating ? (
        <SuggestSheet
          items={items}
          onClose={() => go({})}
          onSent={(id) => go({ tab: "mine", mine: id })}
        />
      ) : null}
    </div>
  );
}

/** Votar y quitar el voto: un voto por club; la hoja de ruta se actualiza con lo que devuelve la API. */
function useVote() {
  const t = useT("roadmap");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(item: RoadmapItem) {
    setBusy(item.id);
    try {
      const res = await apiFetch(`/api/org/roadmap/${item.id}/vote`, {
        method: item.votedByClub ? "DELETE" : "PUT",
        schema: RoadmapItemResponseSchema,
      });
      client.setQueryData<RoadmapResponse>(["org", slug, "roadmap"], (old) =>
        old ? { items: old.items.map((i) => (i.id === res.item.id ? res.item : i)) } : old,
      );
      void client.invalidateQueries({ queryKey: ["org", slug, "suggestions"] });
      toast("success", res.item.votedByClub ? t("voted", { title: res.item.title }) : t("unvoted"));
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(null);
    }
  }
  return { toggle, busy };
}

function useAreaLabel() {
  const areas = useT("suggestionAreas");
  return (area: SuggestionArea) => areas(area);
}

function RoadmapTab({
  items,
  loading,
  hrefOf,
}: {
  items: RoadmapItem[];
  loading: boolean;
  hrefOf: (id: string) => string;
}) {
  const t = useT("roadmap");
  const c = useT("common");
  const statuses = useT("suggestionStatus");
  const etaLabel = useEtaLabel();
  const area = useAreaLabel();
  const intl = useIntl();
  const { toggle, busy } = useVote();

  if (loading) return <p className="text-body text-muted">{c("loading")}</p>;
  const coming = items.filter((i) => i.rank !== null);
  const open = items.filter((i) => i.status === "open");
  const released = items.filter((i) => i.status === "released");

  const voteAction = (i: RoadmapItem): RowAction[] =>
    isVotableSuggestion(i.status)
      ? [
          {
            key: "vote",
            label: i.votedByClub ? t("unvote") : t("vote"),
            action: "vote",
            tone: i.votedByClub ? "primary" : "default",
            onClick: () => void toggle(i),
            loading: busy === i.id,
          },
        ]
      : [];

  const titleCell = (i: RoadmapItem) => (
    <span className="flex min-w-0 flex-col">
      <Link to={hrefOf(i.id)} className="font-medium text-ink">
        {i.title}
      </Link>
      <span className="flex flex-wrap items-center gap-2 text-secondary text-muted">
        {area(i.area)}
        {i.requestedByClub ? <StatusChip kind="club">{t("requestedByClub")}</StatusChip> : null}
      </span>
    </span>
  );
  const votesCell = (i: RoadmapItem) => (
    <span className="inline-flex items-center gap-2">
      {i.votedByClub ? <StatusChip kind="success">{t("votedShort")}</StatusChip> : null}
      {i.votes}
    </span>
  );
  /** En móvil todo va en la línea de debajo: el título necesita el ancho de la fila. */
  const subtitle = (i: RoadmapItem, ...parts: (string | null)[]) =>
    [
      ...parts,
      t("votesShort", { count: i.votes }),
      i.votedByClub ? t("votedShort") : null,
      i.requestedByClub ? t("requestedByClub") : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="flex flex-col gap-5">
      <Card title={t("coming.title")} description={t("coming.description")} padded={false}>
        <DataList<RoadmapItem>
          caption={t("coming.title")}
          rows={coming}
          getKey={(i) => i.id}
          href={(i) => hrefOf(i.id)}
          rowActions={voteAction}
          empty={
            <EmptyState
              icon={<Icon.Lightbulb weight="duotone" />}
              title={t("coming.empty")}
              description={t("coming.emptyHint")}
            />
          }
          columns={[
            {
              key: "rank",
              header: t("table.rank"),
              cell: (i) => <span className="font-mono">{i.rank}</span>,
            },
            { key: "title", header: t("table.improvement"), cell: titleCell },
            {
              key: "status",
              header: t("table.status"),
              cell: (i) => <SuggestionStatusChip status={i.status} />,
            },
            {
              key: "eta",
              header: t("table.eta"),
              cell: (i) => etaLabel(i.eta) ?? <span className="text-muted">{t("noEta")}</span>,
            },
            { key: "votes", header: t("table.votes"), cell: votesCell, numeric: true },
          ]}
          mobileRow={(i) => ({
            title: `${i.rank}. ${i.title}`,
            subtitle: subtitle(i, statuses(i.status), etaLabel(i.eta) ?? t("noEta")),
          })}
        />
      </Card>

      <Card title={t("open.title")} description={t("open.description")} padded={false}>
        <DataList<RoadmapItem>
          caption={t("open.title")}
          rows={open}
          getKey={(i) => i.id}
          href={(i) => hrefOf(i.id)}
          rowActions={voteAction}
          empty={
            <EmptyState
              icon={<Icon.Lightbulb weight="duotone" />}
              title={t("open.empty")}
              description={t("open.emptyHint")}
            />
          }
          columns={[
            { key: "title", header: t("table.improvement"), cell: titleCell },
            { key: "votes", header: t("table.votes"), cell: votesCell, numeric: true },
          ]}
          mobileRow={(i) => ({ title: i.title, subtitle: subtitle(i) })}
        />
      </Card>

      {released.length > 0 ? (
        <Card title={t("released.title")} description={t("released.description")} padded={false}>
          <DataList<RoadmapItem>
            caption={t("released.title")}
            rows={released}
            getKey={(i) => i.id}
            href={(i) => hrefOf(i.id)}
            empty={null}
            columns={[
              { key: "title", header: t("table.improvement"), cell: titleCell },
              {
                key: "released",
                header: t("table.released"),
                cell: (i) =>
                  i.releasedAt
                    ? intl.formatDate(new Date(i.releasedAt), { dateStyle: "medium" })
                    : "",
              },
            ]}
            mobileRow={(i) => ({
              title: i.title,
              subtitle: [
                area(i.area),
                i.releasedAt
                  ? intl.formatDate(new Date(i.releasedAt), { dateStyle: "medium" })
                  : "",
              ]
                .filter(Boolean)
                .join(" · "),
              trailing: <SuggestionStatusChip status={i.status} />,
            })}
          />
        </Card>
      ) : null}
    </div>
  );
}

function RoadmapItemSheet({ item, onClose }: { item: RoadmapItem | null; onClose: () => void }) {
  const t = useT("roadmap");
  const c = useT("common");
  const etaLabel = useEtaLabel();
  const area = useAreaLabel();
  const intl = useIntl();
  const { toggle, busy } = useVote();
  return (
    <Sheet
      open={item !== null}
      onClose={onClose}
      closeLabel={c("close")}
      title={item?.title ?? ""}
      description={item ? area(item.area) : undefined}
      footer={
        item ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              {c("close")}
            </Button>
            {isVotableSuggestion(item.status) ? (
              <Button
                action="vote"
                variant={item.votedByClub ? "secondary" : "primary"}
                loading={busy === item.id}
                aria-pressed={item.votedByClub}
                onClick={() => void toggle(item)}
              >
                {item.votedByClub ? t("unvote") : t("voteThis")}
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {item ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <SuggestionStatusChip status={item.status} />
            {item.requestedByClub ? (
              <StatusChip kind="club">{t("requestedByClub")}</StatusChip>
            ) : null}
            {item.votedByClub ? <StatusChip kind="success">{t("votedByClub")}</StatusChip> : null}
          </div>
          {item.body ? <p className="whitespace-pre-line text-body text-ink">{item.body}</p> : null}
          <Definitions
            items={[
              ...(item.rank !== null
                ? [{ term: t("detail.rank"), detail: t("detail.rankValue", { rank: item.rank }) }]
                : []),
              ...(item.status === "released"
                ? [
                    {
                      term: t("detail.released"),
                      detail: item.releasedAt
                        ? intl.formatDate(new Date(item.releasedAt), { dateStyle: "long" })
                        : "",
                    },
                  ]
                : [{ term: t("detail.eta"), detail: etaLabel(item.eta) ?? t("noEta") }]),
              { term: t("detail.votes"), detail: t("votes", { count: item.votes }) },
            ]}
          />
          <p className="text-secondary text-muted">{t(`statusHelp.${item.status}`)}</p>
        </div>
      ) : null}
    </Sheet>
  );
}

function MineTab({
  suggestions,
  loading,
  hrefOf,
  onCreate,
}: {
  suggestions: ClubSuggestion[];
  loading: boolean;
  hrefOf: (id: string) => string;
  onCreate: () => void;
}) {
  const t = useT("roadmap");
  const c = useT("common");
  const etaLabel = useEtaLabel();
  const area = useAreaLabel();
  const intl = useIntl();
  const sent = (s: ClubSuggestion) =>
    intl.formatDate(new Date(s.createdAt), { dateStyle: "medium" });

  if (loading) return <p className="text-body text-muted">{c("loading")}</p>;
  return (
    <Card padded={false}>
      <DataList<ClubSuggestion>
        caption={t("tabs.mine")}
        rows={suggestions}
        getKey={(s) => s.id}
        href={(s) => hrefOf(s.id)}
        empty={
          <EmptyState
            icon={<Icon.Lightbulb weight="duotone" />}
            title={t("mine.empty")}
            description={t("mine.emptyHint")}
            action={
              <Button action="add" onClick={onCreate}>
                {t("suggest")}
              </Button>
            }
          />
        }
        columns={[
          {
            key: "title",
            header: t("table.suggestion"),
            cell: (s) => (
              <span className="flex min-w-0 flex-col">
                <span className="font-medium text-ink">{s.title}</span>
                <span className="text-secondary text-muted">{area(s.area)}</span>
              </span>
            ),
          },
          {
            key: "status",
            header: t("table.status"),
            cell: (s) => <SuggestionStatusChip status={s.status} />,
          },
          {
            key: "eta",
            header: t("table.eta"),
            cell: (s) => etaLabel(s.eta ?? s.mergedInto?.eta) ?? "",
          },
          {
            key: "sent",
            header: t("table.sent"),
            cell: (s) => (
              <span className="flex flex-col">
                <span>{sent(s)}</span>
                {s.createdBy ? (
                  <span className="text-secondary text-muted">{s.createdBy}</span>
                ) : null}
              </span>
            ),
          },
        ]}
        mobileRow={(s) => ({
          title: s.title,
          subtitle: [sent(s), etaLabel(s.eta ?? s.mergedInto?.eta)].filter(Boolean).join(" · "),
          trailing: <SuggestionStatusChip status={s.status} />,
        })}
      />
    </Card>
  );
}

function MineSheet({
  suggestion,
  onClose,
  onOpenItem,
}: {
  suggestion: ClubSuggestion | null;
  onClose: () => void;
  onOpenItem: (id: string) => void;
}) {
  const t = useT("roadmap");
  const c = useT("common");
  const etaLabel = useEtaLabel();
  const area = useAreaLabel();
  const intl = useIntl();
  const s = suggestion;
  const published = s?.publicTitle ?? null;
  const target = s?.mergedInto ?? null;
  return (
    <Sheet
      open={s !== null}
      onClose={onClose}
      closeLabel={c("close")}
      title={s?.title ?? ""}
      description={s ? area(s.area) : undefined}
      footer={
        s ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              {c("close")}
            </Button>
            {published || target ? (
              <Button action="open" onClick={() => onOpenItem(target ? target.id : s.id)}>
                {t("mine.seeInRoadmap")}
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {s ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <SuggestionStatusChip status={s.status} />
          </div>
          <p className="text-body text-ink">
            {s.status === "merged"
              ? target
                ? t("mine.mergedInto", { title: target.title })
                : t("mine.mergedPending")
              : t(`mine.statusHelp.${s.status}`)}
          </p>
          {s.response ? (
            <Alert kind="info" title={t("mine.response")}>
              <span className="whitespace-pre-line">{s.response}</span>
            </Alert>
          ) : null}
          <Definitions
            items={[
              ...(published && published !== s.title
                ? [{ term: t("mine.publicTitle"), detail: published }]
                : []),
              ...(etaLabel(s.eta ?? target?.eta)
                ? [{ term: t("detail.eta"), detail: etaLabel(s.eta ?? target?.eta) }]
                : []),
              ...(s.votes !== null
                ? [{ term: t("detail.votes"), detail: t("votes", { count: s.votes }) }]
                : []),
              {
                term: t("mine.sent"),
                detail: t("mine.sentBy", {
                  date: intl.formatDate(new Date(s.createdAt), { dateStyle: "long" }),
                  name: s.createdBy ?? "",
                }),
              },
            ]}
          />
          <section className="flex flex-col gap-1">
            <h3 className="text-secondary font-medium text-muted">{t("mine.written")}</h3>
            <p className="whitespace-pre-line text-body text-ink">{s.body}</p>
          </section>
        </div>
      ) : null}
    </Sheet>
  );
}

function SuggestSheet({
  items,
  onClose,
  onSent,
}: {
  items: RoadmapItem[];
  onClose: () => void;
  onSent: (id: string) => void;
}) {
  const t = useT("roadmap");
  const f = useT("roadmap.form");
  const c = useT("common");
  const errors = useT("errors");
  const area = useAreaLabel();
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const { toggle, busy: voting } = useVote();
  const [form, setForm] = useState<{ title: string; body: string; area: SuggestionArea | "" }>({
    title: "",
    body: "",
    area: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lo que ya está en la hoja de ruta y se parece: mejor votarlo que pedirlo otra vez.
  const similar = similarSuggestions(`${form.title} ${form.body}`, items);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = SuggestionCreateSchema.safeParse(form);
    if (!parsed.success) {
      setError(f("invalid"));
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/org/suggestions", {
        method: "POST",
        body: parsed.data,
        schema: ClubSuggestionResponseSchema,
      });
      await client.invalidateQueries({ queryKey: ["org", slug, "suggestions"] });
      toast("success", f("sent"));
      onSent(res.suggestion.id);
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
      description={f("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="send" type="submit" form="suggest-form" loading={busy}>
            {f("submit")}
          </Button>
        </>
      }
    >
      <form id="suggest-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {error ? <Alert kind="error">{error}</Alert> : null}
        <Field label={f("titleLabel")} hint={f("titleHint")}>
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              maxLength={SUGGESTION_TITLE_MAX}
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          )}
        </Field>
        {similar.length > 0 ? (
          <section
            className="flex flex-col gap-2 rounded-card border border-line bg-raised p-3"
            aria-live="polite"
          >
            <h3 className="text-secondary font-medium text-ink">{f("similarTitle")}</h3>
            <p className="text-secondary text-muted">{f("similarHint")}</p>
            <ul className="flex flex-col gap-2">
              {similar.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body text-ink">{i.title}</span>
                    <span className="text-secondary text-muted">
                      {t("votes", { count: i.votes })}
                    </span>
                  </span>
                  {isVotableSuggestion(i.status) ? (
                    <Button
                      action="vote"
                      size="sm"
                      variant="secondary"
                      aria-pressed={i.votedByClub}
                      loading={voting === i.id}
                      onClick={() => void toggle(i)}
                    >
                      {i.votedByClub ? t("votedShort") : t("vote")}
                    </Button>
                  ) : (
                    <SuggestionStatusChip status={i.status} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <Field label={f("areaLabel")}>
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
                  {area(a)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={f("bodyLabel")} hint={f("bodyHint")}>
          {(id, describedBy) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              rows={5}
              maxLength={SUGGESTION_BODY_MAX}
              required
              className={textareaClass}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}
