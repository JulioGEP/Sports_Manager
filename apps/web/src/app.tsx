import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, RouterProvider, useParams } from "react-router";
import { ClubShell } from "@/layouts/club-shell";
import { PlatformShell } from "@/layouts/platform-shell";
import { LocaleProvider } from "@/lib/intl";
import { PlatformAuditPage } from "@/routes/admin/audit";
import { PlatformClubPage } from "@/routes/admin/club";
import { PlatformClubsPage } from "@/routes/admin/clubs";
import { PlatformSetupPage } from "@/routes/admin/setup";
import { PlatformSystemPage } from "@/routes/admin/system";
import { ForgotPasswordPage } from "@/routes/auth/forgot";
import { LoginPage } from "@/routes/auth/login";
import { ResetPasswordPage } from "@/routes/auth/reset";
import { AgendaPage } from "@/routes/club/agenda";
import { ChallengePage } from "@/routes/club/challenge";
import { ChallengesPage, FamilyPlayerChallengesPage } from "@/routes/club/challenges";
import { ClubMemberPage } from "@/routes/club/club-member";
import { ClubMembersPage } from "@/routes/club/club-members";
import { FacilitiesPage } from "@/routes/club/facilities";
import { FacilityPage } from "@/routes/club/facility";
import { FamilyPage } from "@/routes/club/family";
import { FamilyPlayerPage } from "@/routes/club/family-player";
import { FeesPage } from "@/routes/club/fees";
import { ClubHome } from "@/routes/club/home";
import { InvitationPage } from "@/routes/club/invitation";
import { PlayerPage } from "@/routes/club/player";
import { PlayersPage } from "@/routes/club/players";
import { SectionPage } from "@/routes/club/section";
import { SectionsPage } from "@/routes/club/sections";
import { SettingsPage } from "@/routes/club/settings";
import { StaffPage } from "@/routes/club/staff";
import { TeamPage } from "@/routes/club/team";
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
      // Las secciones sustituyen a la lista de equipos (Bloque 14); la ficha de equipo sigue aquí.
      { path: "teams", element: <ClubRedirect to="/sections" /> },
      { path: "teams/:id", element: <TeamPage /> },
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
      { path: "family", element: <FamilyPage /> },
      { path: "family/:id", element: <FamilyPlayerPage /> },
      { path: "family/:id/challenges", element: <FamilyPlayerChallengesPage /> },
      { path: "challenges", element: <ChallengesPage /> },
      { path: "challenges/:id", element: <ChallengePage /> },
      { path: "settings", element: <SettingsPage /> },
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
