import { ApiErrorSchema, VIEW_AS_HEADER, type ApiErrorCode } from "@sportsmanager/shared";

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
  /** Club al que va dirigida la petición; por defecto, el club de la página actual. */
  club?: string | null;
  /**
   * Con "ver como" activo, la petición va por defecto con los ojos de la persona observada.
   * `false` la manda con los ojos propios: lo necesita la lista de personas del propio "ver como",
   * que la persona observada no siempre puede leer (Bloque 19).
   */
  viewAs?: boolean;
}

/**
 * Club de la página actual (ADR 0027): la web lo declara en la cabecera `x-sm-club` de cada
 * petición. Lo fija el espacio del club al montarse y lo limpia al salir.
 */
let currentClub: string | null = null;
export const CLUB_HEADER = "x-sm-club";

export function setCurrentClub(slug: string | null): void {
  currentClub = slug;
}

export function getCurrentClub(): string | null {
  return currentClub;
}

/**
 * "Ver como" (Bloque 14): la administración mira el club con los ojos de otra persona. La web
 * manda su id en cada petición del club; la API decide si puede. Lo fija el espacio del club.
 */
let currentViewAs: string | null = null;

export function setCurrentViewAs(userId: string | null): void {
  currentViewAs = userId;
}

export function getCurrentViewAs(): string | null {
  return currentViewAs;
}

function clubHeaders(club: string | null, viewAs = true): Record<string, string> {
  return {
    ...(club ? { [CLUB_HEADER]: club } : {}),
    ...(club && viewAs && currentViewAs ? { [VIEW_AS_HEADER]: currentViewAs } : {}),
  };
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
 * Única forma en que la web habla con el back (ADR 0001): REST en el mismo origen, con la cookie
 * de sesión y el club en la cabecera. Valida la respuesta con el esquema compartido si se le pasa.
 *
 * Las GET que salen en el mismo instante (lo que pide una pantalla al montarse) viajan juntas en un
 * lote (`POST /api/batch`, ADR 0060): una sola invocación de la función en vez de una por petición.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions<T> = {},
): Promise<T> {
  const club = options.club === undefined ? currentClub : options.club;
  const method = options.method ?? "GET";
  const headers = clubHeaders(club, options.viewAs ?? true);
  if (method === "GET" && options.body === undefined && batchable(path)) {
    return enqueue(path, headers).then((reply) => settle(reply.status, reply.body, options.schema));
  }
  return send(
    path,
    {
      method,
      headers: {
        accept: "application/json",
        ...headers,
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    },
    options.schema,
  );
}

// --- Lote de lecturas (ADR 0060) ---

/** Lo mismo que acepta la API en un lote; Better Auth y los webhooks van siempre sueltos. */
function batchable(path: string): boolean {
  return path.startsWith("/api/") && !/^\/api\/(auth|batch|webhooks)(\/|$)/.test(path);
}

/** Tope de la API por lote. */
const BATCH_MAX = 20;

interface Reply {
  status: number;
  body: unknown;
}

interface Pending {
  path: string;
  headers: Record<string, string>;
  resolve: (reply: Reply) => void;
  reject: (error: unknown) => void;
}

let queue: Pending[] = [];
/** La misma GET pedida dos veces en el mismo tick (dos pantallas, dos claves) viaja una vez. */
let inQueue = new Map<string, Promise<Reply>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function enqueue(path: string, headers: Record<string, string>): Promise<Reply> {
  const key = `${path} ${JSON.stringify(headers)}`;
  const queued = inQueue.get(key);
  if (queued) return queued;
  const reply = new Promise<Reply>((resolve, reject) => {
    queue.push({ path, headers, resolve, reject });
    // Un tick: lo que la pantalla pide en el mismo render sale junto.
    flushTimer ??= setTimeout(flush, 0);
  });
  inQueue.set(key, reply);
  return reply;
}

function flush(): void {
  const items = queue;
  queue = [];
  inQueue = new Map();
  flushTimer = null;
  for (let i = 0; i < items.length; i += BATCH_MAX) {
    const chunk = items.slice(i, i + BATCH_MAX);
    if (chunk.length === 1) void single(chunk[0]!);
    else void sendBatch(chunk);
  }
}

/** Una sola petición no necesita lote: va como siempre. */
async function single(item: Pending): Promise<void> {
  try {
    const res = await fetch(item.path, {
      method: "GET",
      headers: { accept: "application/json", ...item.headers },
      credentials: "same-origin",
    });
    item.resolve({ status: res.status, body: await readJson(res) });
  } catch {
    item.reject(new ApiClientError(0, "network", "network"));
  }
}

async function sendBatch(items: Pending[]): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/batch", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        requests: items.map((item) => ({ path: item.path, headers: item.headers })),
      }),
    });
  } catch {
    for (const item of items) item.reject(new ApiClientError(0, "network", "network"));
    return;
  }
  const json = (await readJson(res)) as { responses?: Reply[] } | null;
  const responses = res.ok ? json?.responses : undefined;
  if (!responses || responses.length !== items.length) {
    // Una API sin lote (un deploy a medias) o un lote rechazado: cada petición, por su cuenta.
    for (const item of items) void single(item);
    return;
  }
  items.forEach((item, i) => item.resolve(responses[i]!));
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function settle<T>(status: number, json: unknown, schema?: Parser<T>): T {
  if (status < 200 || status >= 300) throw errorFromBody(status, json);
  return schema ? schema.parse(json) : (json as T);
}

/** Sube un fichero con `PUT`: cuerpo binario con el tipo del fichero (logos). */
export async function uploadFile<T>(path: string, file: File, schema: Parser<T>): Promise<T> {
  return send(
    path,
    {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": file.type,
        ...clubHeaders(currentClub),
      },
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
  return settle(res.status, await readJson(res), schema);
}

/** Clave de mensaje para un error, dentro del bloque `errors` de los diccionarios de la web. */
export function errorKey(error: unknown): ClientErrorCode {
  return error instanceof ApiClientError ? error.code : "unknown";
}
