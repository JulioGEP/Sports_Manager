import { MessageThreadResponseSchema } from "@sportsmanager/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { fitnessKey, useClubTimezone, useMyMessages } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { Alert, Button, Card, EmptyState, Icon, PageHeader, useToast } from "@/ui";

/**
 * El hilo del atleta con su box (ADR 0049): una conversación, como un chat. Lo que escribe lo lee
 * el equipo del box; nunca hay mensajes entre atletas ni con menores.
 */
export function AthleteMessagesPage() {
  const t = useT("fitness.athlete.messages");
  const errors = useT("errors");
  const intl = useIntl();
  const timezone = useClubTimezone();
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const thread = useMyMessages();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const count = thread.data?.messages.length ?? 0;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      const next = await apiFetch("/api/org/me/messages", {
        method: "POST",
        body: { body },
        schema: MessageThreadResponseSchema,
      });
      client.setQueryData(fitnessKey(slug, "my-messages"), next);
      setText("");
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  const minor = thread.error instanceof ApiClientError && thread.error.status === 403;
  const stamp = (iso: string) =>
    intl.formatDate(new Date(iso), {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      ...(timezone ? { timeZone: timezone } : {}),
    });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {thread.isPending ? (
        <div className="h-64 animate-pulse rounded-card bg-raised" aria-busy="true" />
      ) : minor ? (
        <Alert kind="info" title={t("minorTitle")}>
          {t("minorBody")}
        </Alert>
      ) : thread.isError ? (
        <Alert kind="error">{errors(errorKey(thread.error))}</Alert>
      ) : (
        <Card padded={false}>
          <div
            className="flex max-h-[60vh] min-h-64 flex-col gap-3 overflow-y-auto px-4 py-4"
            aria-live="polite"
          >
            {thread.data.messages.length === 0 ? (
              <EmptyState
                icon={<Icon.Envelope size={28} weight="duotone" aria-hidden="true" />}
                title={t("emptyTitle")}
                description={t("emptyHint")}
              />
            ) : (
              thread.data.messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex max-w-[85%] flex-col gap-1 ${m.fromAthlete ? "self-end items-end" : "self-start items-start"}`}
                >
                  <span className="text-label text-muted">
                    {m.fromAthlete ? t("you") : m.author.name} · {stamp(m.createdAt)}
                  </span>
                  <p
                    className={`whitespace-pre-line rounded-card px-4 py-2 text-body ${
                      m.fromAthlete ? "bg-club text-on-club" : "bg-raised text-ink"
                    }`}
                  >
                    {m.body}
                  </p>
                </div>
              ))
            )}
            <div ref={end} />
          </div>
          <form
            onSubmit={(e) => void send(e)}
            className="flex items-end gap-2 border-t border-line px-4 py-3"
          >
            <label htmlFor="message-body" className="sr-only">
              {t("label")}
            </label>
            <textarea
              id="message-body"
              rows={2}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={t("placeholder")}
              className="min-h-12 flex-1 resize-none rounded-field border border-control bg-surface px-4 py-3 text-body text-ink outline-none focus:border-2 focus:border-club"
            />
            <Button type="submit" action="send" loading={busy} disabled={!text.trim()}>
              {t("send")}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
