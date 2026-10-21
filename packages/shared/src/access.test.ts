import { describe, expect, it } from "vitest";
import {
  ACCESS_AREAS,
  ACCESS_PROFILES,
  AREA_PERMISSIONS,
  CONFIGURABLE_PROFILES,
  defaultPermissionsOf,
  effectivePermissions,
  isAreaVisible,
  membershipOfProfile,
  profileOf,
  PROFILE_SCOPE,
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
    ]);
    expect(visibleAreas(defaultPermissionsOf("director"))).toEqual([
      "sections",
      "players",
      "agenda",
      "facilities",
      "challenges",
    ]);
    expect(visibleAreas(defaultPermissionsOf("org_admin"))).toEqual([...ACCESS_AREAS]);
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

  it("las exclusiones de una persona mandan sobre su rol, pero nunca sobre la administración", () => {
    const rules: AccessRule[] = [
      { profile: null, userId: "u1", area: "agenda", effect: "deny" },
      { profile: "org_admin", userId: null, area: "fees", effect: "deny" },
    ];
    const coach = effectivePermissions([{ roleCode: "coach", position: null }], rules);
    expect(coach.has("org.events.read")).toBe(false);
    expect(coach.has("org.events.write_own")).toBe(false);
    expect(coach.has("org.attendance.write_own")).toBe(false);
    expect(coach.has("org.players.read")).toBe(true);

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
