import { ApiErrorSchema, type ApiErrorCode } from "@sportsmanager/shared";

/** Códigos de error que la web traduce. Los de la API más los de Better Auth que importan. */
export type ClientErrorCode =
  | ApiErrorCode
  | "INVALID_EMAIL_OR_PASSWORD"
  | "INVALID_TOKEN"
  | "rate_limited"
  | "network"
  | "unknown";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

interface Parser<T> {
  parse(data: unknown): T;
}

export interface ApiFetchOptions<T> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  schema?: Parser<T>;
}

function errorFromBody(status: number, json: unknown): ApiClientError {
  const api = ApiErrorSchema.safeParse(json);
  if (api.success) return new ApiClientError(status, api.data.error.code, api.data.error.message);
  if (status === 429) return new ApiClientError(status, "rate_limited", "rate_limited");
  // Better Auth responde { code, message }.
  if (typeof json === "object" && json !== null) {
    const { code, message } = json as { code?: unknown; message?: unknown };
    if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "INVALID_TOKEN") {
      return new ApiClientError(status, code, typeof message === "string" ? message : code);
    }
    if (typeof message === "string") return new ApiClientError(status, "unknown", message);
  }
  return new ApiClientError(status, "unknown", `HTTP ${status}`);
}

/**
 * Única forma en que la web habla con el back (ADR 0001): REST en el mismo host, con la cookie
 * de sesión. Valida la respuesta con el esquema compartido cuando se le pasa uno.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions<T> = {},
): Promise<T> {
  return send(
    path,
    {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    },
    options.schema,
  );
}

/** Sube un fichero con `PUT`: cuerpo binario con el tipo del fichero (logos, Bloque 5). */
export async function uploadFile<T>(path: string, file: File, schema: Parser<T>): Promise<T> {
  return send(
    path,
    {
      method: "PUT",
      headers: { accept: "application/json", "content-type": file.type },
      body: file,
    },
    schema,
  );
}

async function send<T>(path: string, init: RequestInit, schema?: Parser<T>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, credentials: "same-origin" });
  } catch {
    throw new ApiClientError(0, "network", "network");
  }
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!res.ok) throw errorFromBody(res.status, json);
  return schema ? schema.parse(json) : (json as T);
}

/** Clave de mensaje para un error, dentro del bloque `errors` de los diccionarios de la web. */
export function errorKey(error: unknown): ClientErrorCode {
  return error instanceof ApiClientError ? error.code : "unknown";
}
