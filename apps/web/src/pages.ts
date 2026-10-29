import { createElement, type ComponentType } from "react";

/**
 * Cada pantalla en su propio fichero, que se descarga cuando hace falta (ADR 0060). El código de
 * arranque lleva solo lo común (React, el enrutador, la caché, el design system y el espacio del
 * club); antes viajaban las sesenta pantallas juntas, 2,3 MB, y un móvil tardaba en leerlas.
 *
 * La precarga (`lib/prefetch.ts`) usa los mismos cargadores: al pasar por un enlace, o en un rato
 * libre tras entrar, la pantalla ya está descargada cuando se pulsa.
 */
type Page = () => Promise<ComponentType>;

export const pages = {
  landing: () => import("@/routes/landing").then((m) => m.Landing),
  login: () => import("@/routes/auth/login").then((m) => m.LoginPage),
  platformLogin: () =>
    import("@/routes/auth/login").then(({ LoginPage }) => {
      const PlatformLogin = () => createElement(LoginPage, { platform: true });
      return PlatformLogin;
    }),
  forgotPassword: () => import("@/routes/auth/forgot").then((m) => m.ForgotPasswordPage),
  resetPassword: () => import("@/routes/auth/reset").then((m) => m.ResetPasswordPage),
  clubs: () => import("@/routes/clubs").then((m) => m.ClubsPage),
  invitation: () => import("@/routes/club/invitation").then((m) => m.InvitationPage),

  platformShell: () => import("@/layouts/platform-shell").then((m) => m.PlatformShell),
  platformSetup: () => import("@/routes/admin/setup").then((m) => m.PlatformSetupPage),
  platformClubs: () => import("@/routes/admin/clubs").then((m) => m.PlatformClubsPage),
  platformClub: () => import("@/routes/admin/club").then((m) => m.PlatformClubPage),
  platformSuggestions: () =>
    import("@/routes/admin/suggestions").then((m) => m.PlatformSuggestionsPage),
  platformAudit: () => import("@/routes/admin/audit").then((m) => m.PlatformAuditPage),
  platformSystem: () => import("@/routes/admin/system").then((m) => m.PlatformSystemPage),

  home: () => import("@/routes/club/home").then((m) => m.ClubHome),
  sections: () => import("@/routes/club/sections").then((m) => m.SectionsPage),
  section: () => import("@/routes/club/section").then((m) => m.SectionPage),
  sectionMatchConfig: () =>
    import("@/routes/club/section-match-config").then((m) => m.SectionMatchConfigPage),
  sectionTrainingConfig: () =>
    import("@/routes/club/section-training-config").then((m) => m.SectionTrainingConfigPage),
  sectionMethodology: () =>
    import("@/routes/club/section-methodology").then((m) => m.SectionMethodologyPage),
  team: () => import("@/routes/club/team").then((m) => m.TeamPage),
  teamMatches: () => import("@/routes/club/team-matches").then((m) => m.TeamMatchesPage),
  teamMatchHistory: () =>
    import("@/routes/club/team-match-history").then((m) => m.TeamMatchHistoryPage),
  match: () => import("@/routes/club/match-live").then((m) => m.MatchLivePage),
  matchStats: () => import("@/routes/club/match-stats").then((m) => m.MatchStatsPage),
  players: () => import("@/routes/club/players").then((m) => m.PlayersPage),
  player: () => import("@/routes/club/player").then((m) => m.PlayerPage),
  playerPerformance: () =>
    import("@/routes/club/player-performance").then((m) => m.PlayerPerformancePage),
  clubMembers: () => import("@/routes/club/club-members").then((m) => m.ClubMembersPage),
  clubMember: () => import("@/routes/club/club-member").then((m) => m.ClubMemberPage),
  staff: () => import("@/routes/club/staff").then((m) => m.StaffPage),
  agenda: () => import("@/routes/club/agenda").then((m) => m.AgendaPage),
  facilities: () => import("@/routes/club/facilities").then((m) => m.FacilitiesPage),
  facility: () => import("@/routes/club/facility").then((m) => m.FacilityPage),
  fees: () => import("@/routes/club/fees").then((m) => m.FeesPage),
  store: () => import("@/routes/club/store").then((m) => m.StorePage),
  storeOrder: () => import("@/routes/club/store-order").then((m) => m.StoreOrderPage),
  family: () => import("@/routes/club/family").then((m) => m.FamilyPage),
  familyPlayer: () => import("@/routes/club/family-player").then((m) => m.FamilyPlayerPage),
  familyPlayerChallenges: () =>
    import("@/routes/club/challenges").then((m) => m.FamilyPlayerChallengesPage),
  challenges: () => import("@/routes/club/challenges").then((m) => m.ChallengesPage),
  challenge: () => import("@/routes/club/challenge").then((m) => m.ChallengePage),
  settings: () => import("@/routes/club/settings").then((m) => m.SettingsPage),
  training: () => import("@/routes/club/training-hub").then((m) => m.TrainingHubPage),
  teamTraining: () => import("@/routes/club/team-training").then((m) => m.TeamTrainingPage),
  teamTrainingSeason: () =>
    import("@/routes/club/team-training-season").then((m) => m.TeamTrainingSeasonPage),
  teamTrainingHistory: () =>
    import("@/routes/club/team-training-history").then((m) => m.TeamTrainingHistoryPage),
  teamLoad: () => import("@/routes/club/team-load").then((m) => m.TeamLoadPage),
  teamTests: () => import("@/routes/club/team-tests").then((m) => m.TeamTestsPage),
  session: () => import("@/routes/club/session").then((m) => m.SessionPage),
  sessionCourt: () => import("@/routes/club/session-court").then((m) => m.SessionCourtPage),
  sessionPrint: () => import("@/routes/club/session-print").then((m) => m.SessionPrintPage),
  drills: () => import("@/routes/club/drills").then((m) => m.DrillsPage),
  drill: () => import("@/routes/club/drill").then((m) => m.DrillPage),
  infirmary: () => import("@/routes/club/infirmary").then((m) => m.InfirmaryPage),
  athlete: () => import("@/routes/club/athlete").then((m) => m.AthletePage),
  athleteTraining: () =>
    import("@/routes/club/athlete-training").then((m) => m.AthleteTrainingPage),
} satisfies Record<string, Page>;

export type PageKey = keyof typeof pages;

/** La ruta perezosa de una pantalla para el enrutador. */
export const lazyPage = (key: PageKey) => ({ lazy: { Component: pages[key] } });
