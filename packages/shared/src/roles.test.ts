import { describe, expect, it } from "vitest";
import {
  hasPermission,
  PERMISSIONS,
  permissionsForRoles,
  ROLE_CODES,
  ROLE_PERMISSIONS,
} from "./roles.ts";

describe("roles y permisos", () => {
  it("todo rol tiene su entrada de permisos y solo permisos conocidos", () => {
    for (const role of ROLE_CODES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
      for (const permission of ROLE_PERMISSIONS[role]) expect(PERMISSIONS).toContain(permission);
    }
  });

  it("los permisos de varios roles son la unión", () => {
    const union = permissionsForRoles(["coach", "guardian"]);
    expect([...union].sort()).toEqual(["org.members.read", "org.settings.read"]);
    expect(hasPermission(["guardian"], "org.members.read")).toBe(false);
    expect(hasPermission(["guardian", "coach"], "org.members.read")).toBe(true);
    expect(hasPermission(["org_admin"], "org.members.manage")).toBe(true);
  });
});
