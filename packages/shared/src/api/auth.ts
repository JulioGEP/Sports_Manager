import { z } from "zod";
import { EmailSchema, PASSWORD_MAX_LENGTH, PasswordSchema } from "../users.ts";

/**
 * Cuerpos de los endpoints de Better Auth que usa la web (`/api/auth/*`). Better Auth define
 * el contrato; estos esquemas sirven para validar en el navegador antes de enviar.
 */
export const SignInBodySchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type SignInBody = z.infer<typeof SignInBodySchema>;

export const RequestPasswordResetBodySchema = z.object({ email: EmailSchema });

export const ResetPasswordBodySchema = z.object({
  token: z.string().min(1),
  newPassword: PasswordSchema,
});
export type ResetPasswordBody = z.infer<typeof ResetPasswordBodySchema>;

/** Rutas de la web a las que apuntan los enlaces de los emails. */
export const WEB_PATHS = {
  login: "/login",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  invitation: (token: string) => `/invitations/${token}`,
  members: "/members",
} as const;
