import {
  ClubMembersResponseSchema,
  FacilitiesResponseSchema,
  FamilyResponseSchema,
  MembersResponseSchema,
  PlayersResponseSchema,
  SectionsResponseSchema,
  TeamsResponseSchema,
  personDisplayName,
  playerDisplayName,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useLocale, useT } from "@/lib/intl";
import { Icon } from "@/ui";

/**
 * Paleta de mandos (DESIGN.md 9.17): "Buscar o hacer". Desde cualquier pantalla, con ⌘K (Ctrl K) o
 * el botón de la barra, se llega a una persona, un equipo, una sección, una pantalla o una acción
 * escribiendo dos letras. Es la forma rápida de usar el club: la navegación queda para descubrir.
 */

type GroupKey =
  | "recent"
  | "actions"
  | "go"
  | "players"
  | "teams"
  | "sections"
  | "staff"
  | "clubMembers"
  | "facilities"
  | "family";

const GROUP_ORDER: GroupKey[] = [
  "recent",
  "actions",
  "go",
  "players",
  "teams",
  "sections",
  "staff",
  "clubMembers",
  "facilities",
  "family",
];

interface Item {
  id: string;
  group: GroupKey;
  title: string;
  subtitle?: string | undefined;
  to: string;
}

export interface PaletteLink {
  to: string;
  label: string;
}

const MAX_PER_GROUP = 6;
const RECENT_MAX = 6;

/** Sin acentos ni mayúsculas: "pivot" encuentra "Pívot". */
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function score(item: Item, tokens: string[]): number {
  const title = fold(item.title);
  const subtitle = fold(item.subtitle ?? "");
  let total = 0;
  for (const token of tokens) {
    if (title.startsWith(token)) total += 30;
    else if (title.split(/\s+/).some((w) => w.startsWith(token))) total += 20;
    else if (title.includes(token)) total += 10;
    else if (subtitle.includes(token)) total += 3;
    else return 0;
  }
  return total;
}

export function isMacLike(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

/** ⌘K en Mac, Ctrl K en el resto: abre o cierra la paleta desde cualquier pantalla. */
export function usePaletteShortcut(toggle: () => void) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
}

function recentKey(slug: string) {
  return `sm.palette.recent.${slug}`;
}
function readRecent(slug: string): Item[] {
  try {
    const raw = localStorage.getItem(recentKey(slug));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (x): x is Item =>
              typeof x === "object" &&
              x !== null &&
              typeof (x as Item).to === "string" &&
              typeof (x as Item).title === "string",
          )
          .slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}
function pushRecent(slug: string, item: Item) {
  try {
    const next = [item, ...readRecent(slug).filter((x) => x.to !== item.to)].slice(0, RECENT_MAX);
    localStorage.setItem(recentKey(slug), JSON.stringify(next));
  } catch {
    /* sin almacenamiento, sin recientes */
  }
}

function GroupIcon({ group }: { group: GroupKey }) {
  const props = { size: 20, "aria-hidden": true as const, className: "shrink-0" };
  switch (group) {
    case "recent":
      return <Icon.ClockCounterClockwise {...props} />;
    case "actions":
      return <Icon.Lightning {...props} />;
    case "go":
      return <Icon.ArrowRight {...props} />;
    case "players":
      return <Icon.PersonSimpleRun {...props} />;
    case "teams":
      return <Icon.UsersThree {...props} />;
    case "sections":
      return <Icon.SquaresFour {...props} />;
    case "staff":
      return <Icon.Users {...props} />;
    case "clubMembers":
      return <Icon.IdentificationCard {...props} />;
    case "facilities":
      return <Icon.Buildings {...props} />;
    case "family":
      return <Icon.HandHeart {...props} />;
  }
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-chip border border-control bg-raised px-1.5 font-mono text-label text-muted">
      {children}
    </kbd>
  );
}

/** El botón que abre la paleta: parece un campo de búsqueda porque también lo es. */
export function PaletteButton({
  onClick,
  compact = false,
}: {
  onClick: () => void;
  compact?: boolean;
}) {
  const t = useT("palette");
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={t("open")}
        aria-keyshortcuts="Meta+K Control+K"
        className="inline-grid size-(--h-control) shrink-0 place-items-center rounded-control text-ink transition-colors hover:bg-raised"
      >
        <Icon.MagnifyingGlass size={22} aria-hidden="true" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-keyshortcuts="Meta+K Control+K"
      className="flex h-11 w-full items-center gap-2 rounded-field border border-control bg-page px-3 text-secondary text-muted transition-colors hover:bg-raised hover:text-ink"
    >
      <Icon.MagnifyingGlass size={18} aria-hidden="true" />
      <span className="flex-1 truncate text-left">{t("open")}</span>
      <span className="flex items-center gap-0.5" aria-hidden="true">
        <Kbd>{isMacLike() ? "⌘" : "Ctrl"}</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}

export function CommandPalette({
  open,
  onClose,
  links,
}: {
  open: boolean;
  onClose: () => void;
  links: PaletteLink[];
}) {
  const t = useT("palette");
  const { locale } = useLocale();
  const navigate = useNavigate();
  const { org, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const permissions = org.actor.permissions;
  const has = (p: (typeof permissions)[number]) => permissions.includes(p);
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<Item[]>([]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setQuery("");
      setActive(0);
      setRecent(readRecent(slug));
      d.showModal();
      requestAnimationFrame(() => input.current?.focus());
    }
    if (!open && d.open) d.close();
  }, [open, slug]);

  const enabled = (p: (typeof permissions)[number]) => open && has(p);
  const players = useQuery({
    queryKey: ["org", slug, "players"],
    queryFn: () => apiFetch("/api/org/players", { schema: PlayersResponseSchema }),
    enabled: enabled("org.players.read"),
    staleTime: 60_000,
  });
  const teams = useQuery({
    queryKey: ["org", slug, "teams"],
    queryFn: () => apiFetch("/api/org/teams", { schema: TeamsResponseSchema }),
    enabled: enabled("org.structure.read"),
    staleTime: 60_000,
  });
  const sections = useQuery({
    queryKey: ["org", slug, "sections"],
    queryFn: () => apiFetch("/api/org/sections", { schema: SectionsResponseSchema }),
    enabled: enabled("org.structure.read"),
    staleTime: 60_000,
  });
  const members = useQuery({
    queryKey: ["org", slug, "members"],
    queryFn: () => apiFetch("/api/org/members", { schema: MembersResponseSchema }),
    enabled: enabled("org.members.read"),
    staleTime: 60_000,
  });
  const clubMembers = useQuery({
    queryKey: ["org", slug, "club-members"],
    queryFn: () => apiFetch("/api/org/club-members", { schema: ClubMembersResponseSchema }),
    enabled: enabled("org.club_members.read"),
    staleTime: 60_000,
  });
  const facilities = useQuery({
    queryKey: ["org", slug, "facilities"],
    queryFn: () => apiFetch("/api/org/facilities", { schema: FacilitiesResponseSchema }),
    enabled: enabled("org.facilities.read"),
    staleTime: 60_000,
  });
  const family = useQuery({
    queryKey: ["org", slug, "family"],
    queryFn: () => apiFetch("/api/org/family", { schema: FamilyResponseSchema }),
    enabled: enabled("org.family.read"),
    staleTime: 60_000,
  });

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const actions: { key: string; perm: (typeof permissions)[number]; to: string }[] = [
      { key: "newPlayer", perm: "org.players.write", to: `${paths.players}?new=1` },
      { key: "newSection", perm: "org.structure.write", to: `${paths.sections}?new=1` },
      { key: "newClubMember", perm: "org.club_members.write", to: `${paths.clubMembers}?new=1` },
      { key: "newFacility", perm: "org.facilities.write", to: `${paths.facilities}?new=1` },
      { key: "invite", perm: "org.members.invite", to: `${paths.staff}?invite=1` },
      { key: "newChallenge", perm: "org.challenges.manage", to: `${paths.challenges}?new=1` },
      { key: "newSeason", perm: "org.settings.write", to: `${paths.settings}?tab=seasons&new=1` },
      // Entrenamiento (ADR 0038): la biblioteca y la enfermería no van en la barra.
      { key: "drills", perm: "org.training.read", to: paths.drills },
      { key: "infirmary", perm: "org.load.read", to: paths.infirmary },
    ];
    for (const a of actions) {
      if (has(a.perm))
        out.push({
          id: `action:${a.key}`,
          group: "actions",
          title: t(`actions.${a.key}`),
          to: a.to,
        });
    }
    for (const l of links) out.push({ id: `go:${l.to}`, group: "go", title: l.label, to: l.to });
    for (const p of players.data?.players ?? []) {
      out.push({
        id: `player:${p.id}`,
        group: "players",
        title: playerDisplayName(p),
        subtitle: p.teams.map((x) => x.teamName).join(", ") || t("noTeam"),
        to: paths.player(p.id),
      });
    }
    for (const tm of teams.data?.teams ?? []) {
      out.push({
        id: `team:${tm.id}`,
        group: "teams",
        title: tm.name,
        subtitle: [tm.section.name, tm.category].filter(Boolean).join(" · "),
        to: paths.team(tm.id),
      });
    }
    for (const sec of sections.data?.sections ?? []) {
      out.push({
        id: `section:${sec.id}`,
        group: "sections",
        title: sec.name,
        subtitle: sec.sport.name[locale],
        to: paths.section(sec.id),
      });
    }
    for (const m of members.data?.members ?? []) {
      out.push({
        id: `staff:${m.userId}`,
        group: "staff",
        title: m.name,
        subtitle: [m.email, ...m.teams.map((x) => x.teamName)].join(" · "),
        to: paths.staff,
      });
    }
    for (const cm of clubMembers.data?.members ?? []) {
      out.push({
        id: `club-member:${cm.id}`,
        group: "clubMembers",
        title: personDisplayName(cm.person),
        subtitle: [t("memberNumber", { number: cm.memberNumber }), cm.memberType?.name]
          .filter(Boolean)
          .join(" · "),
        to: paths.clubMember(cm.id),
      });
    }
    for (const f of facilities.data?.facilities ?? []) {
      out.push({
        id: `facility:${f.id}`,
        group: "facilities",
        title: f.name,
        to: paths.facility(f.id),
      });
    }
    for (const fp of family.data?.players ?? []) {
      out.push({
        id: `family:${fp.id}`,
        group: "family",
        title: playerDisplayName(fp),
        to: paths.familyPlayer(fp.id),
      });
    }
    return out;
  }, [
    links,
    players.data,
    teams.data,
    sections.data,
    members.data,
    clubMembers.data,
    facilities.data,
    family.data,
    locale,
    slug,
    permissions,
  ]);

  const tokens = fold(query).split(/\s+/).filter(Boolean);
  const results = useMemo(() => {
    const groups = new Map<GroupKey, Item[]>();
    const best = new Map<GroupKey, number>();
    if (tokens.length === 0) {
      if (recent.length > 0) groups.set("recent", recent);
      for (const it of items) {
        if (it.group !== "actions" && it.group !== "go") continue;
        groups.set(it.group, [...(groups.get(it.group) ?? []), it]);
      }
    } else {
      const scored = items
        .map((it) => ({ it, s: score(it, tokens) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.it.title.localeCompare(b.it.title));
      for (const { it, s } of scored) {
        const list = groups.get(it.group) ?? [];
        if (list.length >= MAX_PER_GROUP) continue;
        groups.set(it.group, [...list, it]);
        best.set(it.group, Math.max(best.get(it.group) ?? 0, s));
      }
    }
    // Con texto, primero el grupo con la mejor coincidencia: "alev" lleva al equipo Alevín A antes
    // que a quienes juegan en él. Sin texto, el orden fijo: recientes, acciones, pantallas.
    return GROUP_ORDER.filter((g) => groups.has(g))
      .sort((a, b) => (best.get(b) ?? 0) - (best.get(a) ?? 0))
      .map((g) => ({ group: g, items: groups.get(g)! }));
  }, [items, tokens.join(" "), recent]);
  const flat = results.flatMap((g) => g.items);

  // El activo vuelve al primero cuando cambia el texto o llegan resultados nuevos: el ratón solo
  // elige si se mueve (`onMouseMove`), nunca porque la lista se haya repintado debajo del puntero.
  useEffect(() => {
    setActive(0);
  }, [query, flat.length]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(item: Item) {
    pushRecent(slug, item);
    onClose();
    void navigate(item.to);
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const item = flat[active];
      if (item) {
        e.preventDefault();
        choose(item);
      }
    }
  }

  const mod = isMacLike() ? "⌘" : "Ctrl";
  let index = -1;
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={t("open")}
      className="m-0 mx-auto mt-[6vh] w-[calc(100%-32px)] max-w-xl rounded-sheet bg-surface p-0 text-ink shadow-float backdrop:bg-ink/40 precisa:mt-[12vh]"
    >
      {open ? (
        <div className="flex max-h-[76vh] flex-col">
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Icon.MagnifyingGlass size={20} aria-hidden="true" className="shrink-0 text-muted" />
            <input
              ref={input}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-results"
              aria-autocomplete="list"
              aria-activedescendant={flat[active] ? `palette-item-${active}` : undefined}
              value={query}
              placeholder={t("placeholder")}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              spellCheck={false}
              className="h-14 min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-muted"
            />
            <button
              type="button"
              onClick={onClose}
              className="hidden shrink-0 precisa:inline-flex"
              aria-label={t("keys.close")}
            >
              <Kbd>esc</Kbd>
            </button>
          </div>
          <ul
            id="palette-results"
            ref={listRef}
            role="listbox"
            aria-label={t("open")}
            className="flex-1 overflow-y-auto p-2"
          >
            {flat.length === 0 ? (
              <li className="px-3 py-8 text-center text-body text-muted">
                {tokens.length === 0 ? t("placeholder") : t("empty", { query })}
              </li>
            ) : (
              results.map((g) => (
                <li key={g.group} role="presentation">
                  <div className="px-3 pt-3 pb-1 text-label font-medium uppercase tracking-wide text-muted">
                    {t(`groups.${g.group}`)}
                  </div>
                  <ul role="group" aria-label={t(`groups.${g.group}`)} className="flex flex-col">
                    {g.items.map((it) => {
                      index += 1;
                      const i = index;
                      const selected = i === active;
                      return (
                        <li
                          key={it.id}
                          id={`palette-item-${i}`}
                          data-index={i}
                          role="option"
                          aria-selected={selected}
                          onMouseMove={() => {
                            if (active !== i) setActive(i);
                          }}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => choose(it)}
                          className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-field px-3 py-1.5 transition-colors ${
                            selected ? "bg-club-soft text-club-soft-text" : "text-ink"
                          }`}
                        >
                          <span className={selected ? "text-club-soft-text" : "text-muted"}>
                            <GroupIcon group={it.group} />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-body font-medium">{it.title}</span>
                            {it.subtitle ? (
                              <span
                                className={`truncate text-secondary ${selected ? "text-club-soft-text" : "text-muted"}`}
                              >
                                {it.subtitle}
                              </span>
                            ) : null}
                          </span>
                          {selected ? (
                            <Icon.ArrowRight size={16} aria-hidden="true" className="shrink-0" />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))
            )}
          </ul>
          <div className="hidden items-center gap-4 border-t border-line px-4 py-2 text-label text-muted precisa:flex">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> {t("keys.move")}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> {t("keys.open")}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>esc</Kbd> {t("keys.close")}
            </span>
            <span className="ml-auto flex items-center gap-1">
              <Kbd>{mod}</Kbd>
              <Kbd>K</Kbd>
            </span>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
