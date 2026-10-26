import { useState } from "react";
import { errorKey } from "@/lib/api";
import { useLibrary } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import {
  Alert,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  StatusChip,
} from "@/ui";

/** El id de un vídeo de YouTube (youtube.com/watch?v=, youtu.be/, /shorts/, /embed/), o nulo. */
function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1) || null;
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const match = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]+)/);
      return match?.[2] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Los movimientos del box (ADR 0049): lo que el box explica en su biblioteca, con sus puntos clave
 * y su vídeo, para repasar la técnica antes de la clase. Se busca por nombre y por disciplina.
 */
export function LibraryPage() {
  const t = useT("fitness.athlete.library");
  const errors = useT("errors");
  const library = useLibrary();
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("");
  const items = library.data?.items ?? [];
  const sections = [
    ...new Set(items.map((i) => i.section).filter((s): s is string => Boolean(s))),
  ].sort();
  const needle = query.trim().toLowerCase();
  const visible = items.filter(
    (i) =>
      (!section || i.section === section) &&
      (!needle ||
        i.name.toLowerCase().includes(needle) ||
        (i.description ?? "").toLowerCase().includes(needle)),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label={t("search")}>
          {(id) => (
            <Input
              id={id}
              type="search"
              value={query}
              placeholder={t("searchPlaceholder")}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
        </Field>
        {sections.length > 1 ? (
          <Field label={t("discipline")}>
            {(id) => (
              <Select id={id} value={section} onChange={(e) => setSection(e.target.value)}>
                <option value="">{t("all")}</option>
                {sections.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
      </div>

      {library.isPending ? (
        <div className="h-48 animate-pulse rounded-card bg-raised" aria-busy="true" />
      ) : library.isError ? (
        <Alert kind="error">{errors(errorKey(library.error))}</Alert>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Icon.Target size={28} weight="duotone" aria-hidden="true" />}
          title={items.length === 0 ? t("emptyTitle") : t("noMatch")}
          description={items.length === 0 ? t("emptyHint") : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((item) => {
            const video = item.videoUrl ? youtubeId(item.videoUrl) : null;
            return (
              <Card
                key={item.id}
                title={item.name}
                actions={
                  item.section ? <StatusChip kind="neutral">{item.section}</StatusChip> : null
                }
              >
                <div className="flex flex-col gap-3">
                  {video ? (
                    <div className="aspect-video overflow-hidden rounded-field bg-raised">
                      <iframe
                        className="size-full"
                        src={`https://www.youtube-nocookie.com/embed/${video}`}
                        title={t("videoOf", { name: item.name })}
                        loading="lazy"
                        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : null}
                  {item.description ? (
                    <p className="whitespace-pre-line text-body text-ink">{item.description}</p>
                  ) : null}
                  {item.coachingPoints ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-label uppercase tracking-wide text-muted">
                        {t("keyPoints")}
                      </span>
                      <p className="whitespace-pre-line text-secondary text-ink">
                        {item.coachingPoints}
                      </p>
                    </div>
                  ) : null}
                  {item.videoUrl && !video ? (
                    <ButtonLink
                      to={item.videoUrl}
                      external
                      variant="secondary"
                      size="sm"
                      icon={<Icon.Play size={18} aria-hidden="true" />}
                    >
                      {t("watch")}
                    </ButtonLink>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
