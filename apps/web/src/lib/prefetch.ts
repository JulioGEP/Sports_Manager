import type { Permission } from "@sportsmanager/shared";
import type { FetchQueryOptions, QueryClient } from "@tanstack/react-query";
import { pages, type PageKey } from "@/pages";
import { agendaWeekQuery, orgQueries } from "./queries";

/**
 * Precarga (ADR 0060): antes de que la persona pulse, la pantalla y sus listas ya están en camino.
 * Al pasar el ratón por un enlace, enfocarlo con el teclado o tocarlo, se descarga el fichero de la
 * pantalla y se piden sus datos; al pulsar, se pinta con lo que ya hay. La caché decide: lo que
 * está fresco no se vuelve a pedir.
 */

export interface PrefetchContext {
  client: QueryClient;
  slug: string;
  can: (permission: Permission) => boolean;
  /** Zona del club: la agenda abre en la semana de hoy allí. */
  timezone: string;
}

type Context = PrefetchContext;

interface Target {
  page: PageKey;
  /** Lo que pide la pantalla al abrirse, con las mismas claves que ella. */
  data?: (ctx: Context) => FetchQueryOptions<unknown, Error, unknown, readonly unknown[]>[];
}

type Options = FetchQueryOptions<unknown, Error, unknown, readonly unknown[]>;
const opts = (o: unknown) => o as Options;

/** Qué pantalla abre una ruta del club (lo que va tras `/<club>`) y qué datos pide. */
function targetOf(rest: string[]): Target | null {
  const [area = "", id, sub, subsub] = rest;
  switch (area) {
    case "":
      return {
        page: "home",
        data: ({ slug, can }) => [
          ...(can("org.structure.read") || can("org.events.read")
            ? [opts(orgQueries.summary(slug))]
            : can("org.family.read")
              ? [opts(orgQueries.family(slug))]
              : []),
          ...(can("org.activity.read") ? [opts(orgQueries.activity(slug, 5))] : []),
        ],
      };
    case "sections":
      if (!id)
        return {
          page: "sections",
          data: ({ slug }) => [opts(orgQueries.seasons(slug)), opts(orgQueries.sections(slug))],
        };
      if (sub === "match-config") return { page: "sectionMatchConfig" };
      if (sub === "training-config") return { page: "sectionTrainingConfig" };
      if (sub === "methodology") return { page: "sectionMethodology" };
      return { page: "section" };
    case "teams":
      if (!id) return null;
      if (sub === "matches")
        return { page: subsub === "history" ? "teamMatchHistory" : "teamMatches" };
      if (sub === "training") {
        if (subsub === "season") return { page: "teamTrainingSeason" };
        if (subsub === "history") return { page: "teamTrainingHistory" };
        if (subsub === "load") return { page: "teamLoad" };
        if (subsub === "tests") return { page: "teamTests" };
        return { page: "teamTraining" };
      }
      return { page: "team" };
    case "matches":
      return id ? { page: sub === "stats" ? "matchStats" : "match" } : null;
    case "players":
      if (id) return { page: sub === "performance" ? "playerPerformance" : "player" };
      return {
        page: "players",
        data: ({ slug }) => [
          opts(orgQueries.players(slug)),
          opts(orgQueries.teams(slug)),
          opts(orgQueries.sections(slug)),
          opts(orgQueries.categories(slug)),
        ],
      };
    case "club-members":
      if (id) return { page: "clubMember" };
      return {
        page: "clubMembers",
        data: ({ slug }) => [
          opts(orgQueries.clubMembers(slug)),
          opts(orgQueries.memberTypes(slug)),
        ],
      };
    case "staff":
      return {
        page: "staff",
        data: ({ slug, can }) => [
          opts(orgQueries.members(slug)),
          opts(orgQueries.teams(slug)),
          ...(can("org.members.invite") ? [opts(orgQueries.invitations(slug))] : []),
        ],
      };
    case "agenda":
      return {
        page: "agenda",
        data: ({ slug, can, timezone }) => {
          const club = can("org.events.read");
          if (!club && !can("org.family.read")) return [];
          return [
            opts(orgQueries.agenda(slug, !club, agendaWeekQuery(timezone).toString())),
            ...(can("org.structure.read")
              ? [opts(orgQueries.sections(slug)), opts(orgQueries.teams(slug))]
              : []),
            ...(can("org.facilities.read") ? [opts(orgQueries.facilities(slug))] : []),
          ];
        },
      };
    case "facilities":
      if (id) return { page: "facility", data: ({ slug }) => [opts(orgQueries.facilities(slug))] };
      return { page: "facilities", data: ({ slug }) => [opts(orgQueries.facilities(slug))] };
    case "fees":
      return {
        page: "fees",
        data: ({ slug, can }) =>
          can("org.fees.read")
            ? [
                opts(orgQueries.feeCharges(slug, null)),
                ...(can("org.settings.read") ? [opts(orgQueries.feesSettings(slug))] : []),
              ]
            : can("org.family.read")
              ? [opts(orgQueries.myFees(slug))]
              : [],
      };
    case "store":
      if (id === "orders" && sub) return { page: "storeOrder" };
      return {
        page: "store",
        data: ({ slug, can }) =>
          can("org.store.read") ? [opts(orgQueries.storeOrders(slug, null))] : [],
      };
    case "family":
      if (id) return { page: sub === "challenges" ? "familyPlayerChallenges" : "familyPlayer" };
      return { page: "family", data: ({ slug }) => [opts(orgQueries.family(slug))] };
    case "challenges":
      return { page: id ? "challenge" : "challenges" };
    case "settings":
      return { page: "settings" };
    case "training":
      return { page: "training", data: ({ slug }) => [opts(orgQueries.teams(slug))] };
    case "sessions":
      if (!id) return null;
      return {
        page: sub === "court" ? "sessionCourt" : sub === "print" ? "sessionPrint" : "session",
      };
    case "drills":
      return { page: id ? "drill" : "drills" };
    case "infirmary":
      return { page: "infirmary" };
    case "me":
      return { page: id === "training" ? "athleteTraining" : "athlete" };
    default:
      return null;
  }
}

/** Pantalla y datos de un enlace interno del club. Lo de fuera del club, o de otro club, no. */
export function prefetchHref(ctx: Context, href: string, withData = true): void {
  let url: URL;
  try {
    url = new URL(href, window.location.origin);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin) return;
  const [, club, ...rest] = url.pathname.split("/");
  if (club !== ctx.slug) return;
  const target = targetOf(rest.filter((part, i) => part !== "" || i === 0));
  if (!target) return;
  void pages[target.page]().catch(() => undefined);
  if (!withData || !target.data) return;
  for (const options of target.data(ctx)) void ctx.client.prefetchQuery(options);
}

/**
 * Engancha la precarga a toda la página del club: cualquier `<a>` (la navegación, los títulos de
 * las listas, los botones-enlace) y cualquier fila con `data-prefetch`. Con ratón, tras un instante
 * encima (barrer el menú no dispara nada); con teclado o dedo, al momento. Devuelve cómo soltarla.
 */
export function installPrefetch(ctx: Context): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const hrefOf = (target: EventTarget | null): string | null => {
    if (!(target instanceof Element)) return null;
    const el = target.closest<HTMLElement>("a[href], [data-prefetch]");
    if (!el) return null;
    return el.dataset["prefetch"] ?? el.getAttribute("href");
  };
  const now = (event: Event) => {
    const href = hrefOf(event.target);
    if (href) prefetchHref(ctx, href);
  };
  const hover = (event: Event) => {
    if (timer) clearTimeout(timer);
    const href = hrefOf(event.target);
    if (href) timer = setTimeout(() => prefetchHref(ctx, href), 60);
  };
  const leave = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  document.addEventListener("pointerover", hover, { passive: true });
  document.addEventListener("pointerout", leave, { passive: true });
  document.addEventListener("focusin", now, { passive: true });
  document.addEventListener("touchstart", now, { passive: true });
  return () => {
    leave();
    document.removeEventListener("pointerover", hover);
    document.removeEventListener("pointerout", leave);
    document.removeEventListener("focusin", now);
    document.removeEventListener("touchstart", now);
  };
}

/**
 * En el primer rato libre tras entrar al club: el fichero de cada pantalla de la navegación, para
 * que ningún clic espere a la red por el código. Solo código: los datos, al acercarse al enlace.
 */
export function preloadPages(ctx: Context, hrefs: string[]): () => void {
  const run = () => {
    for (const href of hrefs) prefetchHref(ctx, href, false);
  };
  if ("requestIdleCallback" in window) {
    const handle = window.requestIdleCallback(run, { timeout: 4000 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = setTimeout(run, 1500);
  return () => clearTimeout(handle);
}
