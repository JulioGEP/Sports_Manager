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
import { ChallengePage } from "@/routes/club/challenge";
import { ChallengesPage } from "@/routes/club/challenges";
import { FamilyPage } from "@/routes/club/family";
import { FamilyPlayerPage } from "@/routes/club/family-player";
import { ClubHome } from "@/routes/club/home";
import { InvitationPage } from "@/routes/club/invitation";
import { MembersPage } from "@/routes/club/members";
import { PlayerPage } from "@/routes/club/player";
import { PlayersPage } from "@/routes/club/players";
import { SettingsPage } from "@/routes/club/settings";
import { TeamPage } from "@/routes/club/team";
import { TeamsPage } from "@/routes/club/teams";
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
      { path: "teams", element: <TeamsPage /> },
      { path: "teams/:id", element: <TeamPage /> },
      { path: "players", element: <PlayersPage /> },
      { path: "players/:id", element: <PlayerPage /> },
      { path: "family", element: <FamilyPage /> },
      { path: "family/:id", element: <FamilyPlayerPage /> },
      { path: "challenges", element: <ChallengesPage /> },
      { path: "challenges/:id", element: <ChallengePage /> },
      { path: "members", element: <MembersPage /> },
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
