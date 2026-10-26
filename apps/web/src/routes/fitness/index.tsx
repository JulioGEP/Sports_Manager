import type { ReactNode } from "react";
import { Navigate, useParams } from "react-router";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useClubModel, useFitnessRole } from "@/lib/fitness";
import { AthleteClassPage } from "./athlete/class";
import { AthleteClassesPage } from "./athlete/classes";
import { AthleteFitnessHome } from "./athlete/home";
import { AthleteMessagesPage } from "./athlete/messages";
import { OwnerFitnessHome } from "./owner/home";
import { StaffClassPage } from "./staff/class";
import { StaffClassesPage } from "./staff/classes";
import { CoachFitnessHome } from "./staff/home";
import { MessagesInboxPage } from "./staff/messages";

/**
 * Clubs de fitness (ADR 0049): la misma ruta enseña lo que toca a cada cual. El atleta reserva y
 * entrena; el coach da sus clases; el dueño lleva el negocio. La familia de un atleta menor sigue
 * con el inicio de siempre (lo pinta `ClubHome`).
 */
export function FitnessHome() {
  const role = useFitnessRole();
  if (role === "owner") return <OwnerFitnessHome />;
  if (role === "coach") return <CoachFitnessHome />;
  return <AthleteFitnessHome />;
}

export function FitnessClassesRoute() {
  const role = useFitnessRole();
  return role === "owner" || role === "coach" ? <StaffClassesPage /> : <AthleteClassesPage />;
}

export function FitnessClassRoute() {
  const { id } = useParams();
  const role = useFitnessRole();
  if (!id) return null;
  return role === "owner" || role === "coach" ? (
    <StaffClassPage id={id} />
  ) : (
    <AthleteClassPage id={id} />
  );
}

export function FitnessMessagesRoute() {
  const role = useFitnessRole();
  const { slug } = useReadyClub();
  if (role === "athlete") return <AthleteMessagesPage />;
  if (role === "guardian") return <Navigate to={clubPaths(slug).home} replace />;
  return <MessagesInboxPage />;
}

type FitnessPath = keyof ReturnType<typeof clubPaths>;

/**
 * Una pantalla del club deportivo que en un box tiene su equivalente (ADR 0050): secciones y
 * equipos son el horario, deportistas y socios son atletas, la agenda son las clases, el
 * entrenamiento es la programación y la biblioteca de tareas son los ejercicios. En un box, el
 * enlace de siempre lleva allí; en un club deportivo, la pantalla de siempre.
 */
export function SportsOnly({
  children,
  fitness,
  withId = false,
}: {
  children: ReactNode;
  /** Adónde va en un box. */
  fitness: FitnessPath;
  /** La ficha equivalente con el mismo id (atleta). */
  withId?: boolean;
}) {
  const model = useClubModel();
  const { slug } = useReadyClub();
  const { id } = useParams();
  if (model !== "fitness") return <>{children}</>;
  const paths = clubPaths(slug);
  const target = paths[fitness];
  const to = typeof target === "function" ? (withId && id ? target(id) : paths.home) : target;
  return <Navigate to={to} replace />;
}
