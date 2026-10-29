import {
  EligibleMembersResponseSchema,
  SectionResponseSchema,
  SectionsResponseSchema,
  defaultSectionKind,
  type Section,
  type SectionKind,
  type SportCatalogEntry,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useLocale, useT } from "@/lib/intl";
import { orgQueries } from "@/lib/queries";
import {
  Alert,
  Avatar,
  Button,
  Card,
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

/** Icono del deporte de una sección (DESIGN.md 8): los iconos propios, por familia de deporte. */
export function SportIcon({ code, size = 22 }: { code: string; size?: number }) {
  const S = Icon.SportIcons;
  if (["swimming", "athletics"].includes(code)) return <S.Cronometro size={size} />;
  if (["yoga", "pilates", "fitness", "crossfit"].includes(code)) return <S.Pesa size={size} />;
  if (["padel", "tennis"].includes(code)) return <S.Pista size={size} />;
  if (code === "gymnastics") return <S.PruebaFisica size={size} />;
  if (code === "other") return <S.Trofeo size={size} />;
  return <S.Balon size={size} />;
}

/** Tarjeta de sección (inicio y lista): deporte, estructura, coordinación y el aviso que toque. */
export function SectionCard({ section, to }: { section: Section; to: string }) {
  const t = useT("sections.card");
  const kinds = useT("sectionKinds");
  const { locale } = useLocale();
  const competition = section.kind === "competition";
  return (
    <Link
      to={to}
      className="flex min-h-40 flex-col gap-3 rounded-card border border-border bg-surface p-4 text-ink no-underline shadow-card transition-colors hover:bg-page precisa:shadow-none"
    >
      <span className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-club-soft text-club-soft-text">
          <SportIcon code={section.sport.code} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-body font-semibold">{section.name}</span>
          <span className="truncate text-label text-muted">
            {section.sport.name[locale]} · {kinds(section.kind)}
          </span>
        </span>
      </span>
      <span className="font-mono text-secondary text-ink">
        {competition
          ? t("competitionNums", {
              categories: section.categoriesCount,
              teams: section.teamsCount,
              players: section.playersCount,
            })
          : t("activityNums", {
              categories: section.categoriesCount,
              teams: section.teamsCount,
              players: section.playersCount,
            })}
      </span>
      <span className="flex items-center gap-2 text-secondary text-muted">
        {section.coordinator ? (
          <>
            <Avatar name={section.coordinator.name} size="sm" />
            <span className="truncate">{t("coordinator", { name: section.coordinator.name })}</span>
          </>
        ) : (
          <span>{t("noCoordinator")}</span>
        )}
      </span>
      <span className="mt-auto flex flex-wrap gap-1">
        {section.status === "archived" ? (
          <StatusChip kind="neutral">{t("archived")}</StatusChip>
        ) : section.teamsWithoutStaff > 0 ? (
          <StatusChip kind="warning">
            {t("withoutStaff", { count: section.teamsWithoutStaff })}
          </StatusChip>
        ) : section.teamsCount === 0 ? (
          <StatusChip kind="neutral">{t("noTeams")}</StatusChip>
        ) : (
          <StatusChip kind="success">{t("ok")}</StatusChip>
        )}
      </span>
    </Link>
  );
}

/** Secciones del club (Bloque 14): la unidad de gestión. Una tarjeta por sección y el alta. */
export function SectionsPage() {
  const t = useT("sections");
  const c = useT("common");
  const errors = useT("errors");
  const client = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { org, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const canWrite = org.actor.permissions.includes("org.structure.write");
  const creating = params.get("new") === "1";
  const seasonParam = params.get("season");

  const seasons = useQuery(orgQueries.seasons(slug));
  const sections = useQuery({
    queryKey: ["org", slug, "sections", seasonParam],
    queryFn: () =>
      apiFetch(`/api/org/sections${seasonParam ? `?season=${seasonParam}` : ""}`, {
        schema: SectionsResponseSchema,
      }),
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });
  const update = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    setParams(sp, { replace: true });
  };

  const active = (sections.data?.sections ?? []).filter((s) => s.status === "active");
  const archived = (sections.data?.sections ?? []).filter((s) => s.status === "archived");

  return (
    <div className="flex flex-col gap-5">
      {/* El alta va en la última tarjeta de la rejilla (o en el vacío), no en la cabecera. */}
      <PageHeader title={t("title")} description={t("description")} />
      {sections.isError ? <Alert kind="error">{errors(errorKey(sections.error))}</Alert> : null}
      {seasons.data && seasons.data.seasons.length > 1 ? (
        <div className="w-full max-w-xs">
          <Select
            aria-label={t("season")}
            value={seasonParam ?? sections.data?.season?.id ?? ""}
            onChange={(e) => update({ season: e.target.value || null })}
          >
            {seasons.data.seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {t("season")}: {s.name}
                {s.isCurrent ? ` · ${t("current")}` : ""}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {seasons.data && seasons.data.seasons.length === 0 ? (
        <Alert
          kind="warning"
          title={t("noSeasonTitle")}
          actions={
            canWrite ? (
              <Link to={`${paths.settings}?tab=seasons&new=1`} className="font-medium">
                {t("createSeason")}
              </Link>
            ) : null
          }
        >
          {t("noSeasonBody")}
        </Alert>
      ) : null}
      {sections.data && sections.data.sections.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon.SquaresFour weight="duotone" />}
            title={t("empty")}
            description={t("emptyHint")}
            action={
              canWrite ? (
                <Button
                  action="add"
                  variant="secondary"
                  size="sm"
                  onClick={() => update({ new: "1" })}
                >
                  {t("new")}
                </Button>
              ) : null
            }
          />
        </Card>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((s) => (
          <SectionCard key={s.id} section={s} to={paths.section(s.id)} />
        ))}
        {canWrite && (sections.data?.sections.length ?? 0) > 0 ? (
          <button
            type="button"
            onClick={() => update({ new: "1" })}
            className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-club-soft-text bg-transparent text-club-soft-text transition-colors hover:bg-club-soft"
          >
            <span className="grid size-10 place-items-center rounded-full border border-dashed border-current">
              <Icon.Plus size={20} aria-hidden="true" />
            </span>
            <span className="font-medium">{t("new")}</span>
          </button>
        ) : null}
      </div>
      {archived.length > 0 ? (
        <Card title={t("archivedTitle")} description={t("archivedDescription")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((s) => (
              <SectionCard key={s.id} section={s} to={paths.section(s.id)} />
            ))}
          </div>
        </Card>
      ) : null}

      {canWrite ? (
        <SectionSheet
          open={creating}
          section={null}
          onClose={() => update({ new: null })}
          onSaved={(saved) => {
            void reload();
            void navigate(paths.section(saved.id));
          }}
        />
      ) : null}
      {!sections.data && !sections.isError ? (
        <div
          className="h-40 animate-pulse rounded-card bg-raised"
          aria-busy="true"
          aria-label={c("loading")}
        />
      ) : null}
    </div>
  );
}

/**
 * Alta y edición de una sección: nombre, deporte (del catálogo), tipo, coordinación y, al crear,
 * las categorías sugeridas por el deporte que el club marque (años de nacimiento calculados desde
 * la temporada actual).
 */
export function SectionSheet({
  open,
  section,
  onClose,
  onSaved,
}: {
  open: boolean;
  section: Section | null;
  onClose: () => void;
  onSaved: (section: Section) => void;
}) {
  const t = useT("sections.sheet");
  const kinds = useT("sectionKinds");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { locale } = useLocale();
  const { slug } = useReadyClub();
  const sports = useQuery({
    ...orgQueries.sports(slug),
    enabled: open,
    staleTime: 300_000,
  });
  // Quien escribe la estructura (dirección, coordinación) no siempre lee el personal (Bloque 19):
  // la lista de candidatos a coordinar sale de un listado propio, sin datos del resto.
  const members = useQuery({
    queryKey: ["org", slug, "eligible-staff"],
    queryFn: () => apiFetch("/api/org/eligible-staff", { schema: EligibleMembersResponseSchema }),
    enabled: open,
  });
  const seasons = useQuery({
    ...orgQueries.seasons(slug),
    enabled: open,
  });
  const [name, setName] = useState(section?.name ?? "");
  const [sportCode, setSportCode] = useState(section?.sport.code ?? "");
  const [kind, setKind] = useState<SectionKind>(section?.kind ?? "competition");
  const [coordinator, setCoordinator] = useState(section?.coordinator?.userId ?? "");
  const [description, setDescription] = useState(section?.description ?? "");
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sport: SportCatalogEntry | undefined = sports.data?.sports.find(
    (s) => s.code === sportCode,
  );
  const seasonYear = useMemo(() => {
    const current = seasons.data?.seasons.find((s) => s.isCurrent);
    return Number((current?.startsOn ?? new Date().toISOString()).slice(0, 4));
  }, [seasons.data]);

  useEffect(() => {
    if (!open) return;
    setName(section?.name ?? "");
    setSportCode(section?.sport.code ?? "");
    setKind(section?.kind ?? "competition");
    setCoordinator(section?.coordinator?.userId ?? "");
    setDescription(section?.description ?? "");
    setChosen(new Set());
    setError(null);
  }, [open, section]);

  /**
   * Al elegir deporte: tipo por defecto, todas las categorías sugeridas marcadas y, en el alta, el
   * nombre propuesto (mientras no se haya escrito otro a mano).
   */
  function chooseSport(code: string) {
    const previous = sports.data?.sports.find((s) => s.code === sportCode);
    const entry = sports.data?.sports.find((s) => s.code === code);
    setSportCode(code);
    setKind(defaultSectionKind(code));
    setChosen(new Set((entry?.config.categories ?? []).map((_, i) => i)));
    if (!section && entry && (name.trim() === "" || name === previous?.name[locale])) {
      setName(entry.name[locale]);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (section) {
        const saved = await apiFetch(`/api/org/sections/${section.id}`, {
          method: "PATCH",
          body: {
            name,
            sportCode,
            kind,
            coordinatorUserId: coordinator || null,
            description: description || null,
          },
          schema: SectionResponseSchema,
        });
        toast("success", t("saved"));
        onClose();
        onSaved(saved.section);
      } else {
        const categories = (sport?.config.categories ?? [])
          .filter((_, i) => chosen.has(i))
          .map((cat) => ({
            name: cat.name[locale],
            gender: null,
            birthYearFrom: cat.ageTo !== undefined ? seasonYear - cat.ageTo : null,
            birthYearTo: cat.ageFrom !== undefined ? seasonYear - cat.ageFrom : null,
          }));
        const saved = await apiFetch("/api/org/sections", {
          method: "POST",
          body: {
            name,
            sportCode,
            kind,
            coordinatorUserId: coordinator || null,
            description: description || null,
            categories,
          },
          schema: SectionResponseSchema,
        });
        toast("success", t("created", { name: saved.section.name }));
        onClose();
        onSaved(saved.section);
      }
    } catch (err) {
      setError(errorKey(err) === "conflict" ? t("nameTaken") : errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  const staff = members.data?.members ?? [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={section ? t("editTitle", { name: section.name }) : t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action={section ? "save" : "add"}
            type="submit"
            form="section-form"
            loading={busy}
            disabled={!sportCode}
          >
            {section ? t("save") : t("submit")}
          </Button>
        </>
      }
    >
      <form id="section-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("sport")} hint={t("sportHint")}>
          {(id) => (
            <Select
              id={id}
              required
              value={sportCode}
              onChange={(e) => chooseSport(e.target.value)}
            >
              <option value="">{t("sportPlaceholder")}</option>
              {(sports.data?.sports ?? []).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name[locale]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("name")} hint={t("nameHint")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={60}
              autoComplete="off"
              value={name}
              placeholder={sport ? sport.name[locale] : ""}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("kind")} hint={kinds(`hint.${kind}`)}>
          {(id) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as SectionKind)}>
              <option value="competition">{kinds("competition")}</option>
              <option value="activity">{kinds("activity")}</option>
            </Select>
          )}
        </Field>
        <Field label={t("coordinator")} hint={t("coordinatorHint")}>
          {(id) => (
            <Select id={id} value={coordinator} onChange={(e) => setCoordinator(e.target.value)}>
              <option value="">{t("noCoordinator")}</option>
              {staff.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("descriptionLabel")}>
          {(id) => (
            <Input
              id={id}
              maxLength={400}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
        {!section && sport && sport.config.categories.length > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-secondary font-medium text-ink">{t("categories")}</legend>
            <p className="text-secondary text-muted">{t("categoriesHint")}</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {sport.config.categories.map((cat, i) => (
                <li key={i}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-control px-3 py-2">
                    <input
                      type="checkbox"
                      checked={chosen.has(i)}
                      onChange={(e) => {
                        const next = new Set(chosen);
                        if (e.target.checked) next.add(i);
                        else next.delete(i);
                        setChosen(next);
                      }}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-body text-ink">{cat.name[locale]}</span>
                      {cat.ageFrom !== undefined || cat.ageTo !== undefined ? (
                        <span className="text-label text-muted">
                          {cat.ageFrom !== undefined && cat.ageTo !== undefined
                            ? t("ages", { from: cat.ageFrom, to: cat.ageTo })
                            : cat.ageFrom !== undefined
                              ? t("agesFrom", { from: cat.ageFrom })
                              : t("agesTo", { to: cat.ageTo ?? 0 })}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ) : null}
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}
