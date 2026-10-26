import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, RouterProvider, useParams } from "react-router";
import { ClubShell } from "@/layouts/club-shell";
import { PlatformShell } from "@/layouts/platform-shell";
import { LocaleProvider } from "@/lib/intl";
import { PlatformAuditPage } from "@/routes/admin/audit";
import { PlatformClubPage } from "@/routes/admin/club";
import { PlatformClubsPage } from "@/routes/admin/clubs";
import { PlatformSetupPage } from "@/routes/admin/setup";
import { PlatformSuggestionsPage } from "@/routes/admin/suggestions";
import { PlatformSystemPage } from "@/routes/admin/system";
import { ForgotPasswordPage } from "@/routes/auth/forgot";
import { LoginPage } from "@/routes/auth/login";
import { ResetPasswordPage } from "@/routes/auth/reset";
import { AgendaPage } from "@/routes/club/agenda";
import { AthletePage } from "@/routes/club/athlete";
import { AthleteTrainingPage } from "@/routes/club/athlete-training";
import { ChallengePage } from "@/routes/club/challenge";
import { ChallengesPage, FamilyPlayerChallengesPage } from "@/routes/club/challenges";
import { ClubMemberPage } from "@/routes/club/club-member";
import { ClubMembersPage } from "@/routes/club/club-members";
import { DrillPage } from "@/routes/club/drill";
import { DrillsPage } from "@/routes/club/drills";
import { FacilitiesPage } from "@/routes/club/facilities";
import { FacilityPage } from "@/routes/club/facility";
import { FamilyPage } from "@/routes/club/family";
import { FamilyPlayerPage } from "@/routes/club/family-player";
import { FeesPage } from "@/routes/club/fees";
import { ClubHome } from "@/routes/club/home";
import { InfirmaryPage } from "@/routes/club/infirmary";
import { InvitationPage } from "@/routes/club/invitation";
import { MatchLivePage } from "@/routes/club/match-live";
import { MatchStatsPage } from "@/routes/club/match-stats";
import { PlayerPage } from "@/routes/club/player";
import { PlayerPerformancePage } from "@/routes/club/player-performance";
import { PlayersPage } from "@/routes/club/players";
import { SectionPage } from "@/routes/club/section";
import { SectionMatchConfigPage } from "@/routes/club/section-match-config";
import { SectionMethodologyPage } from "@/routes/club/section-methodology";
import { SectionTrainingConfigPage } from "@/routes/club/section-training-config";
import { SectionsPage } from "@/routes/club/sections";
import { SessionPage } from "@/routes/club/session";
import { SessionCourtPage } from "@/routes/club/session-court";
import { SessionPrintPage } from "@/routes/club/session-print";
import { SettingsPage } from "@/routes/club/settings";
import { StorePage } from "@/routes/club/store";
import { StoreOrderPage } from "@/routes/club/store-order";
import { StaffPage } from "@/routes/club/staff";
import { TeamPage } from "@/routes/club/team";
import { TeamLoadPage } from "@/routes/club/team-load";
import { TeamMatchHistoryPage } from "@/routes/club/team-match-history";
import { TeamMatchesPage } from "@/routes/club/team-matches";
import { TeamTestsPage } from "@/routes/club/team-tests";
import { TeamTrainingPage } from "@/routes/club/team-training";
import { TeamTrainingHistoryPage } from "@/routes/club/team-training-history";
import { TeamTrainingSeasonPage } from "@/routes/club/team-training-season";
import { TrainingHubPage } from "@/routes/club/training-hub";
import { ClubsPage } from "@/routes/clubs";
import { Landing } from "@/routes/landing";
import { ToastProvider } from "@/ui";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

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
  { path: "/", element: <Landing /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  { path: "/clubs", element: <ClubsPage /> },
  { path: "/members", element: <LegacyRedirect to="/members" /> },
  { path: "/settings", element: <LegacyRedirect to="/settings" /> },
  { path: "/admin/login", element: <LoginPage platform /> },
  { path: "/admin/setup", element: <PlatformSetupPage /> },
  {
    path: "/admin",
    element: <PlatformShell />,
    children: [
      { index: true, element: <PlatformClubsPage /> },
      { path: "clubs/:slug", element: <PlatformClubPage /> },
      // Mejoras de la plataforma (ADR 0047): la bandeja y la hoja de ruta.
      { path: "suggestions", element: <PlatformSuggestionsPage /> },
      { path: "audit", element: <PlatformAuditPage /> },
      { path: "system", element: <PlatformSystemPage /> },
    ],
  },
  { path: "/:club/invitations/:token", element: <InvitationPage /> },
  {
    path: "/:club",
    element: <ClubShell />,
    children: [
      { index: true, element: <ClubHome /> },
      { path: "sections", element: <SectionsPage /> },
      { path: "sections/:id", element: <SectionPage /> },
      { path: "sections/:id/match-config", element: <SectionMatchConfigPage /> },
      // Las secciones sustituyen a la lista de equipos (Bloque 14); la ficha de equipo sigue aquí.
      { path: "teams", element: <ClubRedirect to="/sections" /> },
      { path: "teams/:id", element: <TeamPage /> },
      // Partido en directo (Bloque 20): partidos del equipo, histórico, consola y estadísticas.
      { path: "teams/:id/matches", element: <TeamMatchesPage /> },
      { path: "teams/:id/matches/history", element: <TeamMatchHistoryPage /> },
      { path: "matches/:id", element: <MatchLivePage /> },
      { path: "matches/:id/stats", element: <MatchStatsPage /> },
      { path: "players", element: <PlayersPage /> },
      { path: "players/:id", element: <PlayerPage /> },
      { path: "club-members", element: <ClubMembersPage /> },
      { path: "club-members/:id", element: <ClubMemberPage /> },
      { path: "staff", element: <StaffPage /> },
      { path: "members", element: <ClubRedirect to="/staff" /> },
      { path: "agenda", element: <AgendaPage /> },
      { path: "facilities", element: <FacilitiesPage /> },
      { path: "facilities/:id", element: <FacilityPage /> },
      { path: "fees", element: <FeesPage /> },
      // Tienda (ADR 0041): productos, stock y pedidos, y la compra de familias y deportistas.
      { path: "store", element: <StorePage /> },
      { path: "store/orders/:id", element: <StoreOrderPage /> },
      { path: "family", element: <FamilyPage /> },
      { path: "family/:id", element: <FamilyPlayerPage /> },
      { path: "family/:id/challenges", element: <FamilyPlayerChallengesPage /> },
      { path: "challenges", element: <ChallengesPage /> },
      { path: "challenges/:id", element: <ChallengePage /> },
      { path: "settings", element: <SettingsPage /> },
      // Entrenamiento, carga y salud (ADR 0039): portada, semana y temporada de cada equipo,
      // sesión con modo pista e impresión, biblioteca, rendimiento del jugador, enfermería,
      // ajustes y metodología de la sección y el bienestar del deportista adulto.
      { path: "training", element: <TrainingHubPage /> },
      { path: "teams/:id/training", element: <TeamTrainingPage /> },
      { path: "teams/:id/training/season", element: <TeamTrainingSeasonPage /> },
      { path: "teams/:id/training/history", element: <TeamTrainingHistoryPage /> },
      { path: "teams/:id/training/load", element: <TeamLoadPage /> },
      { path: "teams/:id/training/tests", element: <TeamTestsPage /> },
      { path: "sessions/:id", element: <SessionPage /> },
      { path: "sessions/:id/court", element: <SessionCourtPage /> },
      { path: "sessions/:id/print", element: <SessionPrintPage /> },
      { path: "drills", element: <DrillsPage /> },
      { path: "drills/new", element: <DrillPage /> },
      { path: "drills/:id", element: <DrillPage /> },
      { path: "players/:id/performance", element: <PlayerPerformancePage /> },
      { path: "infirmary", element: <InfirmaryPage /> },
      { path: "sections/:id/training-config", element: <SectionTrainingConfigPage /> },
      { path: "sections/:id/methodology", element: <SectionMethodologyPage /> },
      { path: "me", element: <AthletePage /> },
      { path: "me/training", element: <AthleteTrainingPage /> },
      // Mejoras de la plataforma: vivían en `/roadmap` (ADR 0047); ahora son una pestaña de Ajustes (ADR 0048).
      { path: "roadmap", element: <RoadmapRedirect /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

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
