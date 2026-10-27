import {
  BOX_AREA_SCREENS,
  BOX_AREAS,
  type BoxArea,
  type BoxScreen,
  type Permission,
} from "@sportsmanager/shared";
import { Icon } from "@/ui";
import { clubPaths } from "./club";

/**
 * Áreas del box (ADR 0055): Entrenamiento, Negocio y El box. Cada pantalla del personal cuelga de
 * una; la navegación, la portada de cada área y las tarjetas de los KPIs leen de aquí a dónde
 * lleva cada pantalla, con qué icono y quién la abre. Un solo sitio, así no se contradicen.
 */

type IconComponent = typeof Icon.House;

export interface BoxScreenLink {
  screen: BoxScreen;
  area: BoxArea;
  to: string;
  /** Clave en `fitness.common.nav`. */
  labelKey: string;
  icon: IconComponent;
}

const SCREENS: Record<
  BoxScreen,
  {
    to: (paths: ReturnType<typeof clubPaths>) => string;
    labelKey: string;
    icon: IconComponent;
    /** Quién la abre. Sin permiso, ni sale en la navegación ni se enlaza. */
    permission: Permission;
  }
> = {
  classes: {
    to: (p) => p.classes,
    labelKey: "classes",
    icon: Icon.CalendarBlank,
    permission: "org.events.read",
  },
  programming: {
    to: (p) => p.programming,
    labelKey: "programming",
    icon: Icon.Barbell,
    permission: "org.training.read",
  },
  athletes: {
    to: (p) => p.athletes,
    labelKey: "athletes",
    icon: Icon.UsersThree,
    permission: "org.players.read",
  },
  planning: {
    to: (p) => p.planning,
    labelKey: "planning",
    icon: Icon.Rows,
    permission: "org.training.read",
  },
  exercises: {
    to: (p) => p.exercises,
    labelKey: "library",
    icon: Icon.Target,
    permission: "org.events.read",
  },
  plans: { to: (p) => p.plans, labelKey: "plans", icon: Icon.Ticket, permission: "org.fees.read" },
  payments: {
    to: (p) => p.fees,
    labelKey: "payments",
    icon: Icon.Coins,
    permission: "org.fees.read",
  },
  leads: {
    to: (p) => p.leads,
    labelKey: "leads",
    icon: Icon.UserPlus,
    permission: "org.club_members.read",
  },
  store: {
    to: (p) => p.store,
    labelKey: "store",
    icon: Icon.Storefront,
    permission: "org.store.read",
  },
  announcements: {
    to: (p) => p.announcements,
    labelKey: "announcements",
    icon: Icon.Info,
    permission: "org.events.read",
  },
  messages: {
    to: (p) => p.messages,
    labelKey: "messages",
    icon: Icon.Envelope,
    permission: "org.community.write",
  },
  schedule: {
    to: (p) => p.classTypes,
    labelKey: "classTypes",
    icon: Icon.Clock,
    permission: "org.structure.write",
  },
  staff: {
    to: (p) => p.staff,
    labelKey: "staff",
    icon: Icon.Users,
    permission: "org.members.read",
  },
  rooms: {
    to: (p) => p.facilities,
    labelKey: "rooms",
    icon: Icon.Buildings,
    permission: "org.facilities.read",
  },
  equipment: {
    to: (p) => p.equipment,
    labelKey: "equipment",
    icon: Icon.Package,
    permission: "org.training.read",
  },
  tv: { to: (p) => p.tv, labelKey: "tv", icon: Icon.CornersOut, permission: "org.events.read" },
};

/** Icono de cada área: el de su pantalla principal. */
export const AREA_ICONS: Record<BoxArea, IconComponent> = {
  training: Icon.Barbell,
  business: Icon.Coins,
  box: Icon.Buildings,
};

/** Clave del nombre de cada área en `fitness.common.nav`. */
export const AREA_LABEL_KEYS: Record<BoxArea, string> = {
  training: "groupTraining",
  business: "groupBusiness",
  box: "groupBox",
};

/**
 * Las pantallas que esta persona abre, agrupadas por área y en el orden de la navegación.
 * Anuncios es del Negocio para quien lo lleva; para quien no ve nada del negocio (un coach), se
 * queda en El box, junto a los mensajes, en lugar de abrir un área con una sola pantalla.
 */
export function boxAreaScreens(
  slug: string,
  has: (permission: Permission) => boolean,
): Record<BoxArea, BoxScreenLink[]> {
  const paths = clubPaths(slug);
  const link = (area: BoxArea, screen: BoxScreen): BoxScreenLink => ({
    screen,
    area,
    to: SCREENS[screen].to(paths),
    labelKey: SCREENS[screen].labelKey,
    icon: SCREENS[screen].icon,
  });
  const open = (screen: BoxScreen) => has(SCREENS[screen].permission);
  const out = Object.fromEntries(
    BOX_AREAS.map((area) => [
      area,
      (BOX_AREA_SCREENS[area] as readonly BoxScreen[])
        .filter((s) => open(s) && s !== "announcements")
        .map((s) => link(area, s)),
    ]),
  ) as Record<BoxArea, BoxScreenLink[]>;
  if (open("announcements")) {
    if (out.business.length > 0) out.business.push(link("business", "announcements"));
    else {
      const after = out.box.findIndex((l) => l.screen === "messages") + 1;
      out.box.splice(after, 0, link("box", "announcements"));
    }
  }
  return out;
}

/** A dónde lleva una pantalla, si esta persona la abre. */
export function screenTarget(
  slug: string,
  screen: BoxScreen,
  has: (permission: Permission) => boolean,
): string | null {
  return has(SCREENS[screen].permission) ? SCREENS[screen].to(clubPaths(slug)) : null;
}

export function screenIcon(screen: BoxScreen): IconComponent {
  return SCREENS[screen].icon;
}

export function screenLabelKey(screen: BoxScreen): string {
  return SCREENS[screen].labelKey;
}
