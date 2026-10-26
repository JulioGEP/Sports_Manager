import { MessageThreadResponseSchema, type Message } from "@sportsmanager/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AthletePicker, useStaffError } from "@/components/fitness/staff-ui";
import { ApiClientError, apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import {
  fitnessKey,
  useClassTime,
  useInvalidateFitness,
  useMessageThread,
  useMessageThreads,
} from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { Alert, Avatar, Button, EmptyState, Icon, PageHeader, Sheet, useToast } from "@/ui";

/** Hora si es de hoy; día y hora si no. */
function useStamp() {
  const time = useClassTime();
  return (iso: string) =>
    new Date(iso).toLocaleDateString("en-CA", { timeZone: time.timezone }) === time.today
      ? time.hour(iso)
      : time.when(iso);
}

/**
 * Los mensajes del box con sus atletas adultos (ADR 0049): un hilo por atleta, lo último arriba
 * y lo que el box no ha leído. No hay chat entre atletas: solo atleta y box.
 */
export function MessagesInboxPage() {
  const t = useT("fitness.staff.messages");
  const c = useT("fitness.common");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const navigate = useNavigate();
  const stamp = useStamp();
  const threads = useMessageThreads();
  const [picking, setPicking] = useState(false);
  const list = threads.data?.threads ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button action="send" onClick={() => setPicking(true)}>
            {t("new")}
          </Button>
        }
      />
      {threads.isError ? (
        <Alert kind="error">{t("loadError")}</Alert>
      ) : threads.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label={c("loading")}>
          <div className="h-16 animate-pulse rounded-card bg-raised" />
          <div className="h-16 animate-pulse rounded-card bg-raised" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Icon.Envelope size={28} weight="duotone" aria-hidden="true" />}
          title={t("empty")}
          description={t("emptyHint")}
        />
      ) : (
        <ul className="flex flex-col gap-2.5" aria-label={t("title")}>
          {list.map((th) => (
            <li key={th.playerId}>
              <Link
                to={paths.messageThread(th.playerId)}
                className="flex min-h-16 items-center gap-3 rounded-row bg-surface px-4 py-3 text-inherit no-underline shadow-row precisa:border precisa:border-border hover:bg-raised"
              >
                <Avatar name={th.name} size="md" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-baseline justify-between gap-2">
                    <span
                      className={`truncate text-ink ${th.unread > 0 ? "font-semibold" : "font-medium"}`}
                    >
                      {th.name}
                    </span>
                    <span className="shrink-0 text-label text-muted">
                      {stamp(th.lastMessage.createdAt)}
                    </span>
                  </span>
                  <span className="truncate text-secondary text-muted">
                    {th.lastMessage.fromAthlete ? "" : `${t("box")}: `}
                    {th.lastMessage.body}
                  </span>
                </span>
                {th.unread > 0 ? (
                  <span
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-club font-mono text-label text-on-club"
                    aria-label={t("unread", { count: th.unread })}
                  >
                    {th.unread}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={picking}
        onClose={() => setPicking(false)}
        closeLabel={c("close")}
        title={t("new")}
        description={t("newHint")}
      >
        {picking ? (
          <AthletePicker
            label={t("search")}
            action={(a) => (
              <Button
                variant="secondary"
                size="sm"
                action="open"
                onClick={() => void navigate(paths.messageThread(a.playerId))}
              >
                {t("write")}
              </Button>
            )}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

/** El hilo con un atleta: sus mensajes a la izquierda, los del box a la derecha. */
export function MessageThreadPage() {
  const { id } = useParams();
  const t = useT("fitness.staff.messages");
  const c = useT("fitness.common");
  const nav = useT("fitness.common.nav");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const toast = useToast();
  const client = useQueryClient();
  const invalidate = useInvalidateFitness();
  const errorText = useStaffError();
  const stamp = useStamp();
  const thread = useMessageThread(id);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const count = thread.data?.messages.length ?? 0;

  // Al abrirlo, el hilo queda leído: la bandeja y el inicio, al día.
  useEffect(() => {
    if (thread.data) void client.invalidateQueries({ queryKey: fitnessKey(slug, "threads") });
  }, [thread.data, client, slug]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!id || !body.trim()) return;
    setSending(true);
    try {
      const next = await apiFetch(`/api/org/messages/${id}`, {
        method: "POST",
        body: { body: body.trim() },
        schema: MessageThreadResponseSchema,
      });
      client.setQueryData(fitnessKey(slug, "thread", id), next);
      setBody("");
      void invalidate();
    } catch (err) {
      toast("error", errorText(err));
    } finally {
      setSending(false);
    }
  }

  const header = (
    <PageHeader
      backTo={paths.messages}
      backLabel={nav("messages")}
      title={thread.data?.athlete.name ?? t("title")}
      actions={
        id && thread.data ? (
          <Link to={paths.athleteFile(id)} className="text-secondary font-medium text-club-text">
            {t("file")}
          </Link>
        ) : null
      }
    />
  );

  if (thread.isError) {
    const minor = thread.error instanceof ApiClientError && thread.error.status === 403;
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Alert kind={minor ? "info" : "error"}>{minor ? t("minor") : t("notFound")}</Alert>
      </div>
    );
  }
  if (!thread.data) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div
          className="h-48 animate-pulse rounded-card bg-raised"
          aria-busy="true"
          aria-label={c("loading")}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      <section
        aria-label={t("conversation")}
        className="flex min-h-64 flex-col gap-3 rounded-card bg-raised p-4"
      >
        {thread.data.messages.length === 0 ? (
          <p className="m-auto text-secondary text-muted">{t("threadEmpty")}</p>
        ) : (
          thread.data.messages.map((m) => (
            <Bubble key={m.id} message={m} stamp={stamp(m.createdAt)} />
          ))
        )}
        <div ref={end} />
      </section>
      <form className="flex flex-col gap-2" onSubmit={(e) => void send(e)}>
        <label htmlFor="thread-body" className="text-secondary font-medium text-ink">
          {t("label")}
        </label>
        <textarea
          id="thread-body"
          rows={3}
          maxLength={2000}
          value={body}
          placeholder={t("placeholder")}
          onChange={(e) => setBody(e.target.value)}
          className="w-full rounded-field border border-control bg-surface px-4 py-3 text-body text-ink outline-none focus:border-2 focus:border-club"
        />
        <div className="flex justify-end">
          <Button type="submit" action="send" loading={sending} disabled={!body.trim()}>
            {t("send")}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Bubble({ message, stamp }: { message: Message; stamp: string }) {
  const own = !message.fromAthlete;
  return (
    <div className={`flex flex-col gap-1 ${own ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-line rounded-card px-4 py-2.5 text-body ${
          own ? "bg-club text-on-club" : "bg-surface text-ink shadow-row"
        }`}
      >
        {message.body}
      </div>
      <span className="text-label text-muted">
        {message.author.name} · {stamp}
      </span>
    </div>
  );
}
