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

type Options = FetchQueryOptions<unknown, Error, unknown, readonly unknown[]>;
/** Una consulta normal, o una precarga a medida (las listas por tramos). */
type Prefetch = Options | ((client: QueryClient) => Promise<void>);
const opts = (o: unknown) => o as Options;

interface Target {
  page: PageKey;
  /** Lo que pide la pantalla al abrirse, con las mismas claves que ella. */
  data?: (ctx: Context) => Prefetch[];
}

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
      return { page: "team", data: ({ slug }) => [opts(orgQueries.team(slug, id))] };
    case "matches":
      return id ? { page: sub === "stats" ? "matchStats" : "match" } : null;
    case "players":
      if (id && sub === "performance") return { page: "playerPerformance" };
      if (id)
        return {
          page: "player",
          // La ficha y sus partidos a la vez: antes, los partidos esperaban a la ficha.
          data: ({ slug, can }) => [
            opts(orgQueries.player(slug, id)),
            ...(can("org.matches.read") ? [opts(orgQueries.playerMatches(slug, id))] : []),
          ],
        };
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
                (client) => client.prefetchInfiniteQuery(orgQueries.feeCharges(slug, null)),
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
  for (const item of target.data(ctx)) {
    void (typeof item === "function" ? item(ctx.client) : ctx.client.prefetchQuery(item));
  }
}

/**
 * Engancha la precarga a toda la página del club: cualquier `<a>` (la navegación, los títulos de
 * las listas, los botones-enlace) y cualquier fila con `data-prefetch`. Con ratón, tras un instante
 * encima; con teclado, al enfocar; con el dedo, al tocar sin arrastrar. Devuelve cómo soltarla.
 */
export function installPrefetch(ctx: Context): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: string | null = null;
  const hrefOf = (target: EventTarget | null): string | null => {
    if (!(target instanceof Element)) return null;
    const el = target.closest<HTMLElement>("a[href], [data-prefetch]");
    if (!el) return null;
    return el.dataset["prefetch"] ?? el.getAttribute("href");
  };
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };
  const fire = () => {
    const href = pending;
    cancel();
    if (href) prefetchHref(ctx, href);
  };
  const schedule = (href: string | null, ms: number) => {
    cancel();
    if (!href) return;
    pending = href;
    timer = setTimeout(fire, ms);
  };
  // Ratón o lápiz: tras un instante encima. Barrer el menú no dispara nada.
  const over = (event: PointerEvent) => {
    if (event.pointerType !== "touch") schedule(hrefOf(event.target), 60);
  };
  const out = (event: PointerEvent) => {
    if (event.pointerType !== "touch") cancel();
  };
  // Dedo: solo un toque de verdad. Si el dedo se arrastra (scroll por una lista larga), el
  // navegador cancela el puntero y no se pide nada; al levantarlo, sale ya.
  const down = (event: PointerEvent) => {
    if (event.pointerType === "touch") schedule(hrefOf(event.target), 80);
  };
  const up = (event: PointerEvent) => {
    if (event.pointerType === "touch" && pending) fire();
  };
  const now = (event: FocusEvent) => {
    const href = hrefOf(event.target);
    if (href) prefetchHref(ctx, href);
  };
  document.addEventListener("pointerover", over, { passive: true });
  document.addEventListener("pointerout", out, { passive: true });
  document.addEventListener("pointerdown", down, { passive: true });
  document.addEventListener("pointerup", up, { passive: true });
  document.addEventListener("pointercancel", cancel, { passive: true });
  document.addEventListener("focusin", now, { passive: true });
  return () => {
    cancel();
    document.removeEventListener("pointerover", over);
    document.removeEventListener("pointerout", out);
    document.removeEventListener("pointerdown", down);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", cancel);
    document.removeEventListener("focusin", now);
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
