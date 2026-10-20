import { z } from "zod";

/** Emails siempre en minúsculas y sin espacios; la base lo exige con una restricción. */
export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const UserNameSchema = z.string().trim().min(1).max(120);

/**
 * Política de contraseñas (ADR 0020). El mínimo lo fijó el responsable de producto en 6
 * para que `123456` valga en las cuentas de prueba y demostración. El máximo es el de Better Auth.
 */
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;
export const PasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);
