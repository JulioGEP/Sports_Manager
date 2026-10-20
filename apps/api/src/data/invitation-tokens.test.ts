import { describe, expect, it } from "vitest";
import {
  generateInvitationToken,
  hashInvitationToken,
  INVITATION_TOKEN_PATTERN,
  invitationState,
} from "./invitation-tokens.ts";

describe("tokens de invitación", () => {
  it("genera tokens aleatorios con el formato esperado", () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a).toMatch(INVITATION_TOKEN_PATTERN);
    expect(b).toMatch(INVITATION_TOKEN_PATTERN);
    expect(a).not.toBe(b);
  });

  it("el hash es determinista y no revela el token", () => {
    const token = generateInvitationToken();
    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token));
    expect(hashInvitationToken(token)).toHaveLength(64);
    expect(hashInvitationToken(token)).not.toContain(token);
    expect(hashInvitationToken(token)).not.toBe(hashInvitationToken(generateInvitationToken()));
  });

  it("rechaza formatos que no son un token", () => {
    for (const bad of [
      "",
      "abc",
      "a".repeat(42),
      "a".repeat(44),
      "x y".padEnd(43, "a"),
      "é".repeat(43),
    ]) {
      expect(INVITATION_TOKEN_PATTERN.test(bad), bad).toBe(false);
    }
  });

  it("deduce el estado visible: pendiente caducada → expired; el resto se mantiene", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const past = new Date("2026-10-20T11:59:59Z");
    const future = new Date("2026-10-21T12:00:00Z");
    expect(invitationState("pending", future, now)).toBe("pending");
    expect(invitationState("pending", past, now)).toBe("expired");
    expect(invitationState("pending", now, now)).toBe("expired");
    expect(invitationState("accepted", past, now)).toBe("accepted");
    expect(invitationState("revoked", past, now)).toBe("revoked");
  });
});
