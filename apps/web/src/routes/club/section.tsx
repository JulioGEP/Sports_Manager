import {
  CATEGORY_GENDERS,
  CategoriesResponseSchema,
  CategoryResponseSchema,
  SeasonsResponseSchema,
  SectionDetailResponseSchema,
  SectionsResponseSchema,
  TeamResponseSchema,
  type Category,
  type CategoryGender,
  type Section,
  type SectionDetailResponse,
  type TeamSummary,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useIntl } from "react-intl";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useLocale, useT } from "@/lib/intl";
import {
  Alert,
  Avatar,
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
} from "@/ui";
import { SectionSheet, SportIcon } from "./sections";

type Tab = "teams" | "staff";
type DetailTeam = SectionDetailResponse["categories"][number]["teams"][number];

/**
 * Ficha de una sección (Bloque 14): categorías con sus equipos (o grupos), resumen, cuerpo técnico
 * y avisos. Las palabras cambian con el tipo de sección: equipos y plantilla en competición,
 * grupos e inscritos en actividad.
 */
export function SectionPage() {
  const t = useT("section");
  const kinds = useT("sectionKinds");
  const c = useT("common");
  const errors = useT("errors");
  const intl = useIntl();
  const { locale } = useLocale();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { id = "" } = useParams();
  const { org, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const seasonParam = params.get("season");
  const rawTab = params.get("tab");
  const tab: Tab = rawTab === "staff" ? "staff" : "teams";

  const detail = useQuery({
    queryKey: ["org", slug, "section", id, seasonParam],
    queryFn: () =>
      apiFetch(`/api/org/sections/${id}${seasonParam ? `?season=${seasonParam}` : ""}`, {
        schema: SectionDetailResponseSchema,
      }),
    retry: false,
  });
  const seasons = useQuery({
    queryKey: ["org", slug, "seasons"],
    queryFn: () => apiFetch("/api/org/seasons", { schema: SeasonsResponseSchema }),
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

  const [editing, setEditing] = useState(false);
  const [newCategory, setNewCategory] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [newTeamIn, setNewTeamIn] = useState<string | null>(null);

  if (detail.isError) {
    const notFound = detail.error instanceof ApiClientError && detail.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(detail.error))}</Alert>
    );
  }
  if (!detail.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  const { section, season, categories, summary, access } = detail.data;
  const activity = section.kind === "activity";
  const w = (key: string, values?: Record<string, string | number>) =>
    t(`${activity ? "activity" : "competition"}.${key}`, values);
  const teamsCount = categories.reduce((a, cat) => a + cat.teams.length, 0);
  const when = (iso: string) =>
    intl.formatDate(new Date(iso), {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: org.organization.view === "full" ? org.organization.timezone : undefined,
    });

  return (
    <div className="flex flex-col gap-5">
      <Link
        to={paths.sections}
        className="inline-flex items-center gap-1 text-secondary font-medium text-club-text"
      >
        <Icon.ArrowLeft size={16} aria-hidden="true" />
        {t("back")}
      </Link>
      <PageHeader
        eyebrow={`${kinds(section.kind)}${season ? ` · ${t("seasonLabel", { season: season.name })}` : ""}`}
        title={
          <>
            <span className="grid size-10 place-items-center rounded-full bg-club-soft text-club-soft-text">
              <SportIcon code={section.sport.code} />
            </span>
            {section.name}
            <StatusChip kind="club">{section.sport.name[locale]}</StatusChip>
            {section.status === "archived" ? (
              <StatusChip kind="neutral">{t("archived")}</StatusChip>
            ) : null}
          </>
        }
        description={
          section.coordinator
            ? t("coordinator", { name: section.coordinator.name })
            : access.write
              ? t("noCoordinatorAssign")
              : t("noCoordinator")
        }
        actions={
          access.write ? (
            <>
              <Button action="edit" variant="secondary" onClick={() => setEditing(true)}>
                {t("edit")}
              </Button>
              <Button action="add" variant="secondary" onClick={() => setNewCategory(true)}>
                {t("newCategory")}
              </Button>
              {season && categories.length > 0 ? (
                <Button
                  action="add"
                  onClick={() => setNewTeamIn(categories.length === 1 ? categories[0]!.id : "")}
                >
                  {w("newTeam")}
                </Button>
              ) : null}
            </>
          ) : null
        }
      />
      {seasons.data && seasons.data.seasons.length > 1 ? (
        <div className="w-full max-w-xs">
          <Select
            aria-label={t("season")}
            value={seasonParam ?? season?.id ?? ""}
            onChange={(e) => update({ season: e.target.value || null })}
          >
            {seasons.data.seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {t("season")}: {s.name}
                {s.isCurrent ? ` · ${c("current")}` : ""}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <Tabs<Tab>
        label={section.name}
        selected={tab}
        onChange={(key) => update({ tab: key === "teams" ? null : key })}
        items={[
          { key: "teams", label: w("tabTeams"), count: teamsCount },
          { key: "staff", label: t("tabStaff"), count: summary.staff.length },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {tab === "teams" ? (
            categories.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Icon.SquaresFour weight="duotone" />}
                  title={t("emptyCategories")}
                  description={t("emptyCategoriesHint")}
                  action={
                    access.write ? (
                      <Button
                        action="add"
                        variant="secondary"
                        size="sm"
                        onClick={() => setNewCategory(true)}
                      >
                        {t("newCategory")}
                      </Button>
                    ) : null
                  }
                />
              </Card>
            ) : (
              categories.map((cat) => (
                <Card
                  key={cat.id}
                  padded={false}
                  title={cat.name}
                  description={categoryMeta(cat, t)}
                  actions={
                    access.write ? (
                      <Button
                        iconOnly
                        action="edit"
                        variant="tertiary"
                        size="sm"
                        onClick={() => setEditCategory(cat)}
                      >
                        {c("edit")}
                      </Button>
                    ) : null
                  }
                >
                  <DataList<DetailTeam>
                    caption={cat.name}
                    rows={cat.teams}
                    getKey={(team) => team.id}
                    empty={
                      <p className="px-5 pb-5 text-secondary text-muted">
                        {season ? w("emptyTeams") : t("noSeason")}
                      </p>
                    }
                    columns={[
                      {
                        key: "team",
                        header: w("table.team"),
                        cell: (team) => (
                          <Link to={paths.team(team.id)} className="font-medium text-ink">
                            {team.name}
                          </Link>
                        ),
                      },
                      {
                        key: "players",
                        header: w("table.players"),
                        numeric: true,
                        cell: (team) =>
                          team.capacity !== null
                            ? `${team.playersCount}/${team.capacity}`
                            : team.playersCount,
                      },
                      {
                        key: "staff",
                        header: t("table.staff"),
                        cell: (team) =>
                          team.staff.length > 0 ? (
                            team.staff.map((s) => s.name).join(", ")
                          ) : (
                            <span className="text-warning">{t("noStaff")}</span>
                          ),
                      },
                      {
                        key: "next",
                        header: t("table.next"),
                        cell: (team) =>
                          team.nextEvent ? (
                            <span className="flex flex-col">
                              <span>{when(team.nextEvent.startsAt)}</span>
                              <span className="text-secondary text-muted">
                                {team.nextEvent.kind === "match" && team.nextEvent.opponent
                                  ? t("vs", { opponent: team.nextEvent.opponent })
                                  : (team.nextEvent.facility?.name ?? team.nextEvent.title)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted">{t("noNext")}</span>
                          ),
                      },
                      {
                        key: "status",
                        header: t("table.status"),
                        cell: (team) =>
                          team.status === "archived" ? (
                            <StatusChip kind="neutral">{t("archived")}</StatusChip>
                          ) : (
                            <StatusChip kind="success">{t("active")}</StatusChip>
                          ),
                      },
                    ]}
                    mobileRow={(team) => ({
                      title: <Link to={paths.team(team.id)}>{team.name}</Link>,
                      subtitle: `${w("playersCount", { count: team.playersCount })} · ${
                        team.staff.length > 0
                          ? team.staff.map((s) => s.name).join(", ")
                          : t("noStaff")
                      }`,
                    })}
                    actions={(team) => (
                      <ButtonLink
                        iconOnly
                        action="open"
                        to={paths.team(team.id)}
                        variant="secondary"
                        size="sm"
                      >
                        {c("open")}
                      </ButtonLink>
                    )}
                  />
                </Card>
              ))
            )
          ) : (
            <Card title={t("tabStaff")} description={t("staffDescription")} padded={false}>
              {summary.staff.length === 0 ? (
                <EmptyState icon={<Icon.Users weight="duotone" />} title={t("emptyStaff")} />
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {summary.staff.map((s) => (
                    <li key={s.userId} className="flex min-h-16 items-center gap-3 px-5 py-3">
                      <Avatar name={s.name} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium text-ink">{s.name}</span>
                        <span className="truncate text-secondary text-muted">
                          {s.teams.map((x) => x.teamName).join(", ")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card title={t("summary.title")}>
            <dl className="flex flex-col gap-2 text-body">
              {[
                [w("summary.players"), summary.players],
                [t("summary.guardians"), summary.guardians],
                [
                  t("summary.readiness"),
                  summary.readinessPercent === null ? "—" : `${summary.readinessPercent}%`,
                ],
                [t("summary.staff"), summary.staff.length],
                [t("summary.eventsThisWeek"), summary.eventsThisWeek],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-baseline justify-between gap-3">
                  <dt className="text-secondary text-muted">{label}</dt>
                  <dd className="font-mono text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title={t("alerts.title")} padded={false}>
            {section.teamsWithoutStaff === 0 && section.coordinator && summary.players > 0 ? (
              <EmptyState
                icon={<Icon.CheckCircle weight="duotone" />}
                title={t("alerts.allClear")}
              />
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {!section.coordinator ? (
                  <li className="flex min-h-14 items-center gap-3 px-5 py-3">
                    <span className="size-2.5 shrink-0 rounded-full bg-warning-soft ring-2 ring-warning" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium text-ink">{t("alerts.noCoordinator")}</span>
                      <span className="text-secondary text-muted">
                        {t("alerts.noCoordinatorHint")}
                      </span>
                    </span>
                  </li>
                ) : null}
                {section.teamsWithoutStaff > 0 ? (
                  <li className="flex min-h-14 items-center gap-3 px-5 py-3">
                    <span className="size-2.5 shrink-0 rounded-full bg-warning-soft ring-2 ring-warning" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium text-ink">
                        {w("alerts.withoutStaff", { count: section.teamsWithoutStaff })}
                      </span>
                      <span className="text-secondary text-muted">
                        {t("alerts.withoutStaffHint")}
                      </span>
                    </span>
                  </li>
                ) : null}
                {summary.players === 0 ? (
                  <li className="flex min-h-14 items-center gap-3 px-5 py-3">
                    <span className="size-2.5 shrink-0 rounded-full bg-warning-soft ring-2 ring-warning" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium text-ink">{w("alerts.noPlayers")}</span>
                    </span>
                  </li>
                ) : null}
              </ul>
            )}
          </Card>
          <Card title={t("links.title")}>
            <ul className="flex flex-col gap-2">
              <li>
                <Link to={`${paths.players}?section=${section.id}`} className="font-medium">
                  {w("links.players")}
                </Link>
              </li>
              <li>
                <Link to={`${paths.agenda}?section=${section.id}`} className="font-medium">
                  {t("links.agenda")}
                </Link>
              </li>
            </ul>
          </Card>
        </div>
      </div>

      {access.write ? (
        <>
          <SectionSheet
            open={editing}
            section={section}
            onClose={() => setEditing(false)}
            onSaved={() => void reload()}
          />
          <CategorySheet
            open={newCategory || editCategory !== null}
            sectionId={section.id}
            category={editCategory}
            onClose={() => {
              setNewCategory(false);
              setEditCategory(null);
            }}
            onSaved={() => void reload()}
          />
          {season ? (
            <TeamSheet
              open={newTeamIn !== null}
              team={null}
              sectionId={section.id}
              categories={categories}
              defaultCategoryId={newTeamIn}
              seasonId={season.id}
              activity={activity}
              onClose={() => setNewTeamIn(null)}
              onSaved={(saved) => {
                void reload();
                void navigate(paths.team(saved.id));
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function categoryMeta(
  cat: Category,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  const parts: string[] = [];
  if (cat.gender) parts.push(t(`genders.${cat.gender}`));
  if (cat.birthYearFrom !== null && cat.birthYearTo !== null)
    parts.push(t("bornBetween", { from: cat.birthYearFrom, to: cat.birthYearTo }));
  else if (cat.birthYearTo !== null) parts.push(t("bornUntil", { to: cat.birthYearTo }));
  else if (cat.birthYearFrom !== null) parts.push(t("bornFrom", { from: cat.birthYearFrom }));
  return parts.join(" · ");
}

/** Alta y edición de una categoría: nombre, género y años de nacimiento (opcionales). */
export function CategorySheet({
  open,
  sectionId,
  category,
  onClose,
  onSaved,
}: {
  open: boolean;
  sectionId: string;
  category: Category | null;
  onClose: () => void;
  onSaved: (category: Category) => void;
}) {
  const t = useT("section.categorySheet");
  const g = useT("section.genders");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [name, setName] = useState("");
  const [gender, setGender] = useState<CategoryGender | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setGender(category?.gender ?? "");
    setFrom(category?.birthYearFrom?.toString() ?? "");
    setTo(category?.birthYearTo?.toString() ?? "");
    setStatus(category?.status ?? "active");
    setError(null);
  }, [open, category]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const body = {
      name,
      gender: gender || null,
      birthYearFrom: from ? Number(from) : null,
      birthYearTo: to ? Number(to) : null,
    };
    try {
      const saved = category
        ? await apiFetch(`/api/org/categories/${category.id}`, {
            method: "PATCH",
            body: { ...body, status },
            schema: CategoryResponseSchema,
          })
        : await apiFetch("/api/org/categories", {
            method: "POST",
            body: { ...body, sectionId },
            schema: CategoryResponseSchema,
          });
      toast("success", category ? t("saved") : t("created", { name: saved.category.name }));
      onClose();
      onSaved(saved.category);
    } catch (err) {
      setError(errorKey(err) === "conflict" ? t("nameTaken") : errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={category ? t("editTitle", { name: category.name }) : t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action={category ? "save" : "add"}
            type="submit"
            form="category-form"
            loading={busy}
          >
            {category ? t("save") : t("submit")}
          </Button>
        </>
      }
    >
      <form id="category-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("name")} hint={t("nameHint")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={60}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("gender")}>
          {(id) => (
            <Select
              id={id}
              value={gender}
              onChange={(e) => setGender(e.target.value as CategoryGender | "")}
            >
              <option value="">{t("anyGender")}</option>
              {CATEGORY_GENDERS.map((code) => (
                <option key={code} value={code}>
                  {g(code)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("birthYearFrom")} hint={t("yearsHint")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1900}
                max={2100}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("birthYearTo")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1900}
                max={2100}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            )}
          </Field>
        </div>
        {category ? (
          <Field label={t("status")}>
            {(id) => (
              <Select
                id={id}
                value={status}
                onChange={(e) => setStatus(e.target.value as "active" | "archived")}
              >
                <option value="active">{t("statusActive")}</option>
                <option value="archived">{t("statusArchived")}</option>
              </Select>
            )}
          </Field>
        ) : null}
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

/**
 * Alta y edición de un equipo o grupo: nombre, categoría (de su sección), aforo en actividad,
 * y al editar también la sección (con una categoría de la nueva) y el estado.
 */
export function TeamSheet({
  open,
  team,
  sectionId,
  categories,
  defaultCategoryId,
  seasonId,
  activity,
  onClose,
  onSaved,
}: {
  open: boolean;
  team: TeamSummary | null;
  sectionId: string;
  categories: Category[];
  defaultCategoryId: string | null;
  seasonId: string;
  activity: boolean;
  onClose: () => void;
  onSaved: (team: TeamSummary) => void;
}) {
  const t = useT("section.teamSheet");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const [name, setName] = useState("");
  const [section, setSection] = useState(sectionId);
  const [categoryId, setCategoryId] = useState("");
  const [capacity, setCapacity] = useState("");
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sections = useQuery({
    queryKey: ["org", slug, "sections", null],
    queryFn: () => apiFetch("/api/org/sections", { schema: SectionsResponseSchema }),
    enabled: open && team !== null,
  });
  const otherCategories = useQuery({
    queryKey: ["org", slug, "categories", section],
    queryFn: () =>
      apiFetch(`/api/org/categories?section=${section}`, { schema: CategoriesResponseSchema }),
    enabled: open && section !== sectionId,
  });
  const options: Category[] =
    section === sectionId ? categories : (otherCategories.data?.categories ?? []);

  useEffect(() => {
    if (!open) return;
    setName(team?.name ?? "");
    setSection(team?.section.id ?? sectionId);
    setCategoryId(team?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? "");
    setCapacity(team?.capacity?.toString() ?? "");
    setStatus(team?.status ?? "active");
    setError(null);
  }, [open, team, sectionId, defaultCategoryId, categories]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const saved = team
        ? await apiFetch(`/api/org/teams/${team.id}`, {
            method: "PATCH",
            body: {
              name,
              sectionId: section,
              categoryId,
              capacity: capacity ? Number(capacity) : null,
              status,
            },
            schema: TeamResponseSchema,
          })
        : await apiFetch("/api/org/teams", {
            method: "POST",
            body: {
              sectionId: section,
              seasonId,
              categoryId,
              name,
              capacity: capacity ? Number(capacity) : null,
            },
            schema: TeamResponseSchema,
          });
      toast("success", team ? t("saved") : t("created", { name: saved.team.name }));
      onClose();
      onSaved(saved.team);
    } catch (err) {
      setError(errorKey(err) === "conflict" ? t("nameTaken") : errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  const label = (key: string) => t(`${activity ? "activity" : "competition"}.${key}`);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={team ? t("editTitle", { name: team.name }) : label("title")}
      description={label("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action={team ? "save" : "add"}
            type="submit"
            form="team-form"
            loading={busy}
            disabled={!categoryId}
          >
            {team ? t("save") : label("submit")}
          </Button>
        </>
      }
    >
      <form id="team-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={label("name")} hint={label("nameHint")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={60}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        {team && sections.data ? (
          <Field label={t("section")}>
            {(id) => (
              <Select
                id={id}
                value={section}
                onChange={(e) => {
                  setSection(e.target.value);
                  setCategoryId("");
                }}
              >
                {sections.data.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field label={t("category")} hint={t("categoryHint")}>
          {(id) => (
            <Select
              id={id}
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">{t("categoryPlaceholder")}</option>
              {options.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {activity ? (
          <Field label={t("capacity")} hint={t("capacityHint")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={999}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            )}
          </Field>
        ) : null}
        {team ? (
          <Field label={t("status")}>
            {(id) => (
              <Select
                id={id}
                value={status}
                onChange={(e) => setStatus(e.target.value as "active" | "archived")}
              >
                <option value="active">{t("statusActive")}</option>
                <option value="archived">{t("statusArchived")}</option>
              </Select>
            )}
          </Field>
        ) : null}
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

export type { Section };
