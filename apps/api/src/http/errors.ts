import type { ApiError as ApiErrorBody, ApiErrorCode } from "@sportsmanager/shared";

export type ApiErrorStatus = 400 | 401 | 403 | 404 | 409 | 500;

/** Error con respuesta JSON estable. Lo convierte `app.onError`. */
export class ApiError extends Error {
  constructor(
    readonly status: ApiErrorStatus,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  toBody(): ApiErrorBody {
    const error: ApiErrorBody["error"] = { code: this.code, message: this.message };
    if (this.details !== undefined) error.details = this.details;
    return { error };
  }
}

export const badRequest = (message = "Petición no válida.", details?: unknown) =>
  new ApiError(400, "bad_request", message, details);
export const unauthorized = (message = "Tienes que iniciar sesión.") =>
  new ApiError(401, "unauthorized", message);
export const forbidden = (message = "No tienes permiso para hacer esto.") =>
  new ApiError(403, "forbidden", message);
export const notFound = (message = "No se ha encontrado lo que buscas.") =>
  new ApiError(404, "not_found", message);
export const conflict = (message = "El cambio choca con el estado actual.") =>
  new ApiError(409, "conflict", message);
