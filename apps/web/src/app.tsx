import { QueryClientProvider } from "@tanstack/react-query";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  useParams,
  type RouteObject,
} from "react-router";
import { ClubShell } from "@/layouts/club-shell";
import { isValidClubSlug } from "@/lib/club";
import { LocaleProvider } from "@/lib/intl";
import { queryClient } from "@/lib/query-client";
import { lazyPage } from "@/pages";
import { ToastProvider } from "@/ui";

/** Rutas antiguas del club en la raíz: ahora viven en `/<club>/...`. Sin club conocido, al selector. */
function LegacyRedirect({ to }: { to: string }) {
  const { club } = useParams();
  return <Navigate to={club ? `/${club}${to}` : "/clubs"} replace />;
}

/** Ruta del club que cambió de sitio (Bloque 14): misma consulta, destino nuevo. */
function ClubRedirect({ to }: { to: string }) {
  const { club } = useParams();
  return <Navigate to={`/${club}${to}${window.location.search}`} replace />;
}

/** Ruta desconocida dentro de un club: a su inicio. Si el primer tramo no puede ser un club, a la raíz. */
function ClubFallback() {
  const { club } = useParams();
  return <Navigate to={isValidClubSlug(club) ? `/${club}` : "/"} replace />;
}

/** `/roadmap` (ADR 0047) pasa a la pestaña Mejoras de Ajustes (ADR 0048), con lo que abría. */
function RoadmapRedirect() {
  const { club } = useParams();
  const old = new URLSearchParams(window.location.search);
  const next = new URLSearchParams({ tab: "improvements" });
  for (const key of ["item", "mine", "new"]) {
    const value = old.get(key);
    if (value) next.set(key, value);
  }
  return <Navigate to={`/${club}/settings?${next}`} replace />;
}

/**
 * Mapa de la web (ADR 0027): el negocio en `/admin`, el acceso en la raíz y cada club en `/<slug>/...`.
 * Las rutas fijas van antes que `/:club` y los nombres reservados nunca son un club.
 */
export const router = createBrowserRouter([
  {
    // Mientras llega el fichero de la primera pantalla (ADR 0060): el fondo de la app, sin saltos.
    HydrateFallback: InitialLoading,
    children: routes(),
  },
]);

function InitialLoading() {
  return <div className="min-h-dvh bg-page" aria-busy="true" />;
}

function routes(): RouteObject[] {
  return [
    { path: "/", ...lazyPage("landing") },
    { path: "/login", ...lazyPage("login") },
    { path: "/forgot-password", ...lazyPage("forgotPassword") },
    { path: "/reset-password", ...lazyPage("resetPassword") },
    { path: "/clubs", ...lazyPage("clubs") },
    { path: "/members", element: <LegacyRedirect to="/members" /> },
    { path: "/settings", element: <LegacyRedirect to="/settings" /> },
    { path: "/admin/login", ...lazyPage("platformLogin") },
    { path: "/admin/setup", ...lazyPage("platformSetup") },
    {
      path: "/admin",
      ...lazyPage("platformShell"),
      children: [
        { index: true, ...lazyPage("platformClubs") },
        { path: "clubs/:slug", ...lazyPage("platformClub") },
        // Mejoras de la plataforma (ADR 0047): la bandeja y la hoja de ruta.
        { path: "suggestions", ...lazyPage("platformSuggestions") },
        { path: "audit", ...lazyPage("platformAudit") },
        { path: "system", ...lazyPage("platformSystem") },
      ],
    },
    { path: "/:club/invitations/:token", ...lazyPage("invitation") },
    {
      path: "/:club",
      element: <ClubShell />,
      children: [
        { index: true, ...lazyPage("home") },
        { path: "sections", ...lazyPage("sections") },
        { path: "sections/:id", ...lazyPage("section") },
        { path: "sections/:id/match-config", ...lazyPage("sectionMatchConfig") },
        // Las secciones sustituyen a la lista de equipos (Bloque 14); la ficha de equipo sigue aquí.
        { path: "teams", element: <ClubRedirect to="/sections" /> },
        { path: "teams/:id", ...lazyPage("team") },
        // Partido en directo (Bloque 20): partidos del equipo, histórico, consola y estadísticas.
        { path: "teams/:id/matches", ...lazyPage("teamMatches") },
        { path: "teams/:id/matches/history", ...lazyPage("teamMatchHistory") },
        { path: "matches/:id", ...lazyPage("match") },
        { path: "matches/:id/stats", ...lazyPage("matchStats") },
        { path: "players", ...lazyPage("players") },
        { path: "players/:id", ...lazyPage("player") },
        { path: "club-members", ...lazyPage("clubMembers") },
        { path: "club-members/:id", ...lazyPage("clubMember") },
        { path: "staff", ...lazyPage("staff") },
        { path: "members", element: <ClubRedirect to="/staff" /> },
        { path: "agenda", ...lazyPage("agenda") },
        { path: "facilities", ...lazyPage("facilities") },
        { path: "facilities/:id", ...lazyPage("facility") },
        { path: "fees", ...lazyPage("fees") },
        // Tienda (ADR 0041): productos, stock y pedidos, y la compra de familias y deportistas.
        { path: "store", ...lazyPage("store") },
        { path: "store/orders/:id", ...lazyPage("storeOrder") },
        { path: "family", ...lazyPage("family") },
        { path: "family/:id", ...lazyPage("familyPlayer") },
        { path: "family/:id/challenges", ...lazyPage("familyPlayerChallenges") },
        { path: "challenges", ...lazyPage("challenges") },
        { path: "challenges/:id", ...lazyPage("challenge") },
        { path: "settings", ...lazyPage("settings") },
        // Entrenamiento, carga y salud (ADR 0039): portada, semana y temporada de cada equipo,
        // sesión con modo pista e impresión, biblioteca, rendimiento del jugador, enfermería,
        // ajustes y metodología de la sección y el bienestar del deportista adulto.
        { path: "training", ...lazyPage("training") },
        { path: "teams/:id/training", ...lazyPage("teamTraining") },
        { path: "teams/:id/training/season", ...lazyPage("teamTrainingSeason") },
        { path: "teams/:id/training/history", ...lazyPage("teamTrainingHistory") },
        { path: "teams/:id/training/load", ...lazyPage("teamLoad") },
        { path: "teams/:id/training/tests", ...lazyPage("teamTests") },
        { path: "sessions/:id", ...lazyPage("session") },
        { path: "sessions/:id/court", ...lazyPage("sessionCourt") },
        { path: "sessions/:id/print", ...lazyPage("sessionPrint") },
        { path: "drills", ...lazyPage("drills") },
        { path: "drills/new", ...lazyPage("drill") },
        { path: "drills/:id", ...lazyPage("drill") },
        { path: "players/:id/performance", ...lazyPage("playerPerformance") },
        { path: "infirmary", ...lazyPage("infirmary") },
        { path: "sections/:id/training-config", ...lazyPage("sectionTrainingConfig") },
        { path: "sections/:id/methodology", ...lazyPage("sectionMethodology") },
        { path: "me", ...lazyPage("athlete") },
        { path: "me/training", ...lazyPage("athleteTraining") },
        // Mejoras de la plataforma: vivían en `/roadmap` (ADR 0047); ahora son una pestaña de Ajustes (ADR 0048).
        { path: "roadmap", element: <RoadmapRedirect /> },
        // Una pantalla que ya no existe o una ruta mal escrita: al inicio del club, no a la portada
        // del producto.
        { path: "*", element: <ClubFallback /> },
      ],
    },
    { path: "*", element: <Navigate to="/" replace /> },
  ];
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}
