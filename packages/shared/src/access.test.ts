import { describe, expect, it } from "vitest";
import {
  ACCESS_AREAS,
  ACCESS_PROFILES,
  AREA_PERMISSIONS,
  ADMIN_EXCEPTION_AREAS,
  canHaveOverrides,
  CONFIGURABLE_PROFILES,
  defaultPermissionsOf,
  effectivePermissions,
  isAreaVisible,
  membershipOfProfile,
  overridableAreas,
  overridesFor,
  profileOf,
  PROFILE_SCOPE,
  roleVisibleAreas,
  scopeKindsOf,
  summarizeScope,
  visibleAreas,
  type AccessRule,
} from "./access.ts";
import { PERMISSIONS } from "./roles.ts";

describe("ámbito y áreas de acceso (Bloque 19)", () => {
  it("cada área lleva permisos conocidos y su lectura está entre los suyos", () => {
    for (const area of ACCESS_AREAS) {
      const { reads, all } = AREA_PERMISSIONS[area];
      expect(reads.length).toBeGreaterThan(0);
      for (const p of [...reads, ...all]) expect(PERMISSIONS).toContain(p);
      for (const p of reads) expect(all).toContain(p);
    }
    for (const profile of ACCESS_PROFILES) expect(PROFILE_SCOPE[profile]).toBeDefined();
    expect(CONFIGURABLE_PROFILES).not.toContain("org_admin");
    expect(CONFIGURABLE_PROFILES).not.toContain("guardian");
    expect(CONFIGURABLE_PROFILES).not.toContain("athlete");
  });

  it("el perfil es el cargo cuando hay cargo, y el rol si no", () => {
    expect(profileOf({ roleCode: "staff", position: "physio" })).toBe("physio");
    expect(profileOf({ roleCode: "staff", position: null })).toBe("staff");
    expect(profileOf({ roleCode: "coach", position: "director" })).toBe("coach");
    expect(membershipOfProfile("director")).toEqual({ roleCode: "staff", position: "director" });
    expect(membershipOfProfile("coach")).toEqual({ roleCode: "coach", position: null });
  });

  it("el ámbito sigue al cargo: equipos, secciones, atendidos o el club entero", () => {
    expect(PROFILE_SCOPE.coach).toBe("teams");
    expect(PROFILE_SCOPE.director).toBe("sections");
    expect(PROFILE_SCOPE.coordinator).toBe("sections");
    expect(PROFILE_SCOPE.physio).toBe("attended");
    expect(PROFILE_SCOPE.org_admin).toBe("club");
    expect([...scopeKindsOf([{ roleCode: "coach", position: null }])]).toEqual(["teams"]);
    expect(
      scopeKindsOf([
        { roleCode: "coach", position: null },
        { roleCode: "org_admin", position: null },
      ]).has("club"),
    ).toBe(true);
    expect(summarizeScope({ kind: "club" })).toEqual({ kind: "club" });
    expect(
      summarizeScope({ kind: "restricted", sectionIds: ["s"], teamIds: ["t", "u"], playerIds: [] }),
    ).toEqual({ kind: "restricted", sections: 1, teams: 2, players: 0 });
  });

  it("por defecto el cuerpo técnico y el personal no ven socios, personal ni actividad; la administración sí", () => {
    expect(visibleAreas(defaultPermissionsOf("coach"))).toEqual([
      "sections",
      "players",
      "agenda",
      "facilities",
      "challenges",
      "training",
    ]);
    expect(visibleAreas(defaultPermissionsOf("director"))).toEqual([
      "sections",
      "players",
      "agenda",
      "facilities",
      "challenges",
      "training",
    ]);
    // Todo menos Salud (ADR 0039): la administración no ve diagnósticos por defecto.
    expect(visibleAreas(defaultPermissionsOf("org_admin"))).toEqual(
      ACCESS_AREAS.filter((a) => a !== "health"),
    );
    expect(isAreaVisible(defaultPermissionsOf("physio"), "health")).toBe(true);
    expect(isAreaVisible(defaultPermissionsOf("fitness"), "health")).toBe(true);
    expect(defaultPermissionsOf("fitness").has("org.health.write")).toBe(false);
    expect(isAreaVisible(defaultPermissionsOf("coach"), "health")).toBe(false);
    expect(isAreaVisible(defaultPermissionsOf("guardian"), "players")).toBe(false);
  });

  it("excluir un área quita todo lo del área; incluirla da su lectura", () => {
    const rules: AccessRule[] = [
      { profile: "coach", userId: null, area: "players", effect: "deny" },
      { profile: "coach", userId: null, area: "club_members", effect: "allow" },
    ];
    const coach = effectivePermissions([{ roleCode: "coach", position: null }], rules);
    expect(coach.has("org.players.read")).toBe(false);
    expect(coach.has("org.players.assess_own")).toBe(false);
    expect(coach.has("org.club_members.read")).toBe(true);
    expect(coach.has("org.club_members.write")).toBe(false);
    expect(coach.has("org.structure.read")).toBe(true);

    // Las reglas de otro perfil no le afectan.
    const physio = effectivePermissions([{ roleCode: "staff", position: "physio" }], rules);
    expect(physio.has("org.players.read")).toBe(true);
    expect(physio.has("org.club_members.read")).toBe(false);
  });

  it("las excepciones de una persona mandan sobre su rol en los dos sentidos, pero nunca sobre la administración", () => {
    const rules: AccessRule[] = [
      { profile: null, userId: "u1", area: "agenda", effect: "deny" },
      { profile: null, userId: "u1", area: "club_members", effect: "allow" },
      { profile: "org_admin", userId: null, area: "fees", effect: "deny" },
      { profile: "coach", userId: null, area: "club_members", effect: "deny" },
    ];
    const coach = effectivePermissions([{ roleCode: "coach", position: null }], rules);
    expect(coach.has("org.events.read")).toBe(false);
    expect(coach.has("org.events.write_own")).toBe(false);
    expect(coach.has("org.attendance.write_own")).toBe(false);
    expect(coach.has("org.players.read")).toBe(true);
    // Ve socios aunque su rol no: la excepción de la persona va después de la regla del perfil.
    expect(isAreaVisible(coach, "club_members")).toBe(true);
    for (const p of AREA_PERMISSIONS.club_members.all)
      if (!AREA_PERMISSIONS.club_members.reads.includes(p)) expect(coach.has(p)).toBe(false);

    const admin = effectivePermissions(
      [
        { roleCode: "org_admin", position: null },
        { roleCode: "coach", position: null },
      ],
      rules,
    );
    expect(admin.has("org.events.read")).toBe(true);
    expect(admin.has("org.fees.read")).toBe(true);
  });

  it("lo que ve por su rol ignora sus excepciones; las excepciones son la diferencia con lo que se quiere", () => {
    const rules: AccessRule[] = [
      { profile: "coach", userId: null, area: "facilities", effect: "deny" },
      { profile: null, userId: "u1", area: "agenda", effect: "deny" },
    ];
    const byRole = roleVisibleAreas([{ roleCode: "coach", position: null }], rules);
    expect(byRole).toContain("agenda");
    expect(byRole).not.toContain("facilities");
    expect(byRole).not.toContain("club_members");

    const wanted = [...byRole.filter((a) => a !== "players"), "club_members" as const];
    expect(overridesFor(byRole, wanted)).toEqual({ allow: ["club_members"], deny: ["players"] });
    expect(overridesFor(byRole, byRole)).toEqual({ allow: [], deny: [] });
  });

  it("solo el personal y el cuerpo técnico que no administran tienen excepciones", () => {
    expect(canHaveOverrides(["coach"])).toBe(true);
    expect(canHaveOverrides(["staff"])).toBe(true);
    expect(canHaveOverrides(["guardian", "coach"])).toBe(true);
    expect(canHaveOverrides(["guardian"])).toBe(false);
    expect(canHaveOverrides(["org_admin", "coach"])).toBe(false);
    expect(overridableAreas(["coach"])).toEqual(ACCESS_AREAS);
    expect(overridableAreas(["org_admin", "coach"])).toEqual(ADMIN_EXCEPTION_AREAS);
    expect(overridableAreas(["guardian"])).toEqual([]);
    expect(canHaveOverrides(["athlete"])).toBe(false);
    expect(overridableAreas(["athlete"])).toEqual([]);
  });

  it("a la administración solo se le abre Salud por excepción, y nada más le cambia", () => {
    const rules: AccessRule[] = [
      { profile: null, userId: "a1", area: "health", effect: "allow" },
      { profile: null, userId: "a1", area: "agenda", effect: "deny" },
    ];
    const admin = effectivePermissions([{ roleCode: "org_admin", position: null }], rules);
    expect(admin.has("org.health.read")).toBe(true);
    expect(admin.has("org.health.write")).toBe(false);
    expect(admin.has("org.events.read")).toBe(true);
    const plain = effectivePermissions([{ roleCode: "org_admin", position: null }], []);
    expect(plain.has("org.health.read")).toBe(false);
    expect(plain.has("org.availability.write")).toBe(true);
  });

  it("incluir Entrenamiento a quien no lo tiene da la planificación y la carga, sin escribir", () => {
    const rules: AccessRule[] = [
      { profile: null, userId: "p1", area: "training", effect: "allow" },
    ];
    const psychologist = effectivePermissions(
      [{ roleCode: "staff", position: "psychologist" }],
      [],
    );
    expect(psychologist.has("org.load.read")).toBe(false);
    const opened = effectivePermissions([{ roleCode: "staff", position: "psychologist" }], rules);
    expect(opened.has("org.load.read")).toBe(true);
    expect(opened.has("org.load.write")).toBe(false);
  });

  it("con varios roles, los permisos son la unión después de aplicar las reglas de cada perfil", () => {
    const rules: AccessRule[] = [
      { profile: "coach", userId: null, area: "players", effect: "deny" },
    ];
    const both = effectivePermissions(
      [
        { roleCode: "coach", position: null },
        { roleCode: "staff", position: "physio" },
      ],
      rules,
    );
    expect(both.has("org.players.read")).toBe(true);
    expect(both.has("org.players.assess")).toBe(true);
    expect(both.has("org.roster.write_own")).toBe(true);
  });
});
