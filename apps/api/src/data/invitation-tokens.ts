import type { InvitationState, InvitationStatus } from "@sportsmanager/shared";
import { createHash, randomBytes } from "node:crypto";

/**
 * Token de invitación: 32 bytes aleatorios en base64url. Va en el enlace del email.
 * En base solo se guarda su hash SHA-256: un volcado de la tabla no sirve para aceptar nada.
 */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Formato válido de token: base64url de 32 bytes. Evita consultas con basura. */
export const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Estado visible: el guardado, salvo que una pendiente haya caducado. */
export function invitationState(
  status: InvitationStatus,
  expiresAt: Date,
  now: Date = new Date(),
): InvitationState {
  if (status === "pending" && expiresAt.getTime() <= now.getTime()) return "expired";
  return status;
}
