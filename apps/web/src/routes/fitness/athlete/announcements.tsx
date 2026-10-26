import {
  AnnouncementResponseSchema,
  type Announcement,
  type AnnouncementAudience,
} from "@sportsmanager/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { apiFetch, errorKey } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import {
  useAnnouncements,
  useClassTypes,
  useClubTimezone,
  useInvalidateFitness,
} from "@/lib/fitness";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Segmented,
  Select,
  Sheet,
  StatusChip,
  useToast,
} from "@/ui";

/**
 * Los anuncios del box (ADR 0049): lo que el box cuenta a todos o a una disciplina. El atleta los
 * lee (y quedan leídos al verlos); quien escribe en nombre del box los publica, fija, edita y
 * retira, y ve cuántos los han leído.
 */
export function AnnouncementsPage() {
  const t = useT("fitness.athlete.announcements");
  const errors = useT("errors");
  const intl = useIntl();
  const timezone = useClubTimezone();
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const list = useAnnouncements();
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [removing, setRemoving] = useState<Announcement | null>(null);
  const marked = useRef(new Set<string>());

  // Al verlos, quedan leídos (una vez por anuncio y visita).
  useEffect(() => {
    const unread = (list.data?.announcements ?? []).filter(
      (a) => !a.read && !marked.current.has(a.id),
    );
    if (unread.length === 0) return;
    for (const a of unread) marked.current.add(a.id);
    void Promise.all(
      unread.map((a) =>
        apiFetch(`/api/org/announcements/${a.id}/read`, { method: "POST" }).catch(() => null),
      ),
    ).then(() => invalidate());
  }, [list.data, invalidate]);

  async function remove(a: Announcement) {
    try {
      await apiFetch(`/api/org/announcements/${a.id}`, { method: "DELETE" });
      toast("success", t("removed"));
      await invalidate();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  const canWrite = list.data?.canWrite ?? false;
  const date = (iso: string) =>
    intl.formatDate(new Date(iso), {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(timezone ? { timeZone: timezone } : {}),
    });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={canWrite ? t("descriptionWriter") : t("description")}
        actions={
          canWrite ? (
            <Button action="add" onClick={() => setEditing("new")}>
              {t("new")}
            </Button>
          ) : null
        }
      />
      {list.isPending ? (
        <div className="h-48 animate-pulse rounded-card bg-raised" aria-busy="true" />
      ) : list.isError ? (
        <Alert kind="error">{errors(errorKey(list.error))}</Alert>
      ) : list.data.announcements.length === 0 ? (
        <EmptyState
          icon={<Icon.Info size={28} weight="duotone" aria-hidden="true" />}
          title={t("emptyTitle")}
          description={canWrite ? t("emptyWriter") : t("emptyHint")}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {list.data.announcements.map((a) => (
            <Card
              key={a.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {a.title}
                  {a.pinned ? <StatusChip kind="club">{t("pinned")}</StatusChip> : null}
                  {!a.read && !marked.current.has(a.id) ? (
                    <StatusChip kind="info">{t("unread")}</StatusChip>
                  ) : null}
                </span>
              }
              description={[
                a.author,
                date(a.publishedAt),
                a.section ? a.section.name : t("everyone"),
              ]
                .filter(Boolean)
                .join(" · ")}
              actions={
                canWrite ? (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" action="edit" onClick={() => setEditing(a)}>
                      {t("edit")}
                    </Button>
                    <Button
                      variant="ghost-danger"
                      size="sm"
                      action="delete"
                      onClick={() => setRemoving(a)}
                    >
                      {t("remove")}
                    </Button>
                  </div>
                ) : null
              }
              footer={
                canWrite && a.readCount !== null ? (
                  <span className="text-secondary text-muted">
                    {t("readCount", { count: a.readCount })}
                  </span>
                ) : undefined
              }
            >
              <p className="whitespace-pre-line text-body text-ink">{a.body}</p>
            </Card>
          ))}
        </div>
      )}

      {editing ? (
        <AnnouncementSheet
          key={editing === "new" ? "new" : editing.id}
          announcement={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={t("removeTitle")}
        body={t("removeBody")}
        confirmLabel={t("remove")}
        confirmAction="delete"
        cancelLabel={t("keep")}
        tone="danger"
        onConfirm={() => {
          const a = removing;
          setRemoving(null);
          if (a) void remove(a);
        }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function AnnouncementSheet({
  announcement,
  onClose,
}: {
  announcement: Announcement | null;
  onClose: () => void;
}) {
  const t = useT("fitness.athlete.announcements.sheet");
  const c = useT("fitness.common");
  const errors = useT("errors");
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const { org } = useReadyClub();
  const canSections = org.actor.permissions.includes("org.structure.read");
  const types = useClassTypes(canSections && announcement === null);
  const sections = types.data?.sections ?? [];
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [body, setBody] = useState(announcement?.body ?? "");
  const [audience, setAudience] = useState<AnnouncementAudience>(announcement?.audience ?? "all");
  const [sectionId, setSectionId] = useState(announcement?.section?.id ?? "");
  const [pinned, setPinned] = useState(announcement?.pinned ?? false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (announcement) {
        await apiFetch(`/api/org/announcements/${announcement.id}`, {
          method: "PATCH",
          body: { title: title.trim(), body: body.trim(), pinned },
          schema: AnnouncementResponseSchema,
        });
      } else {
        await apiFetch("/api/org/announcements", {
          method: "POST",
          body: {
            title: title.trim(),
            body: body.trim(),
            audience,
            sectionId: audience === "section" ? sectionId : null,
            pinned,
          },
          schema: AnnouncementResponseSchema,
        });
      }
      toast("success", announcement ? t("updated") : t("published"));
      await invalidate();
      onClose();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  const valid =
    title.trim().length > 0 && body.trim().length > 0 && (audience === "all" || sectionId !== "");

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={announcement ? t("editTitle") : t("newTitle")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action={announcement ? "save" : "send"}
            type="submit"
            form="announcement-form"
            loading={busy}
            disabled={!valid}
          >
            {announcement ? c("save") : t("publish")}
          </Button>
        </>
      }
    >
      <form id="announcement-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("title")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("body")}>
          {(id) => (
            <textarea
              id={id}
              required
              rows={5}
              maxLength={4000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-field border border-control bg-surface px-4 py-3 text-body text-ink outline-none focus:border-2 focus:border-club"
            />
          )}
        </Field>
        {announcement === null && sections.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-secondary font-medium text-ink">{t("audience")}</span>
              <Segmented
                label={t("audience")}
                value={audience}
                onChange={setAudience}
                options={[
                  { key: "all", label: t("all") },
                  { key: "section", label: t("section") },
                ]}
              />
            </div>
            {audience === "section" ? (
              <Field label={t("discipline")}>
                {(id) => (
                  <Select
                    id={id}
                    required
                    value={sectionId}
                    onChange={(e) => setSectionId(e.target.value)}
                  >
                    <option value="">{t("choose")}</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : null}
          </div>
        ) : null}
        <label className="flex min-h-12 items-center gap-3 text-body text-ink">
          <input
            type="checkbox"
            className="size-5 accent-[var(--club-fill)]"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
          />
          {t("pin")}
        </label>
      </form>
    </Sheet>
  );
}
