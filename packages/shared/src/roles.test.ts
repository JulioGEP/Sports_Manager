import { describe, expect, it } from "vitest";
import {
  hasPermission,
  PERMISSIONS,
  permissionsForMemberships,
  permissionsForRoles,
  PLATFORM_SUPPORT_PERMISSIONS,
  ROLE_CODES,
  ROLE_PERMISSIONS,
  STAFF_POSITION_PERMISSIONS,
  STAFF_POSITIONS,
  SUPPORT_GRANT_PERMISSIONS,
} from "./roles.ts";

describe("roles y permisos", () => {
  it("todo rol tiene su entrada de permisos y solo permisos conocidos", () => {
    for (const role of ROLE_CODES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
      for (const permission of ROLE_PERMISSIONS[role]) expect(PERMISSIONS).toContain(permission);
    }
    for (const position of STAFF_POSITIONS) {
      expect(STAFF_POSITION_PERMISSIONS[position]).toBeDefined();
      for (const permission of STAFF_POSITION_PERMISSIONS[position])
        expect(PERMISSIONS).toContain(permission);
    }
  });

  it("los permisos de varios roles son la unión", () => {
    const union = permissionsForRoles(["coach", "guardian"]);
    expect([...union].sort()).toEqual([
      "org.activity.read",
      "org.challenges.manage",
      "org.challenges.read",
      "org.challenges.review_own",
      "org.family.read",
      "org.family.write",
      "org.members.read",
      "org.players.assess_own",
      "org.players.read",
      "org.roster.write_own",
      "org.settings.read",
      "org.structure.read",
    ]);
    expect(hasPermission(["guardian"], "org.players.read")).toBe(false);
    expect(hasPermission(["coach"], "org.players.write")).toBe(false);
    expect(hasPermission(["coach"], "org.players.assess")).toBe(false);
    expect(hasPermission(["guardian"], "org.members.read")).toBe(false);
    expect(hasPermission(["guardian", "coach"], "org.members.read")).toBe(true);
    expect(hasPermission(["org_admin"], "org.members.manage")).toBe(true);
  });

  it("el cargo del personal añade permisos solo con el rol staff", () => {
    const physio = permissionsForMemberships([{ roleCode: "staff", position: "physio" }]);
    expect(physio.has("org.players.assess")).toBe(true);
    expect(physio.has("org.players.write")).toBe(false);
    expect(physio.has("org.structure.write")).toBe(false);

    const director = permissionsForMemberships([{ roleCode: "staff", position: "director" }]);
    expect(director.has("org.structure.write")).toBe(true);
    expect(director.has("org.players.write")).toBe(true);
    expect(director.has("org.challenges.review")).toBe(true);
    expect(director.has("org.members.manage")).toBe(false);
    expect(director.has("org.settings.write")).toBe(false);

    const delegate = permissionsForMemberships([{ roleCode: "staff", position: "delegate" }]);
    expect([...delegate].sort()).toEqual([...ROLE_PERMISSIONS.staff].sort());

    // Un cargo sin el rol staff no añade nada.
    const coach = permissionsForMemberships([{ roleCode: "coach", position: "director" }]);
    expect(coach.has("org.structure.write")).toBe(false);
  });

  it("el soporte de plataforma nunca incluye datos personales ni escritura", () => {
    expect(PLATFORM_SUPPORT_PERMISSIONS).toEqual(["org.support.read"]);
    for (const permission of SUPPORT_GRANT_PERMISSIONS) {
      expect(permission.endsWith(".read"), permission).toBe(true);
    }
    expect(SUPPORT_GRANT_PERMISSIONS).not.toContain("org.members.manage");
  });
});
