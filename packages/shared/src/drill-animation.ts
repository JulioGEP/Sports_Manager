import { z } from "zod";

/**
 * Pizarra animada (ADR 0040): el movimiento de las piezas grabado en el tiempo y, aparte, la voz
 * de quien lo explica. Cada pista es la trayectoria de una pieza: puntos `[ms, x, y]` en orden,
 * con las mismas coordenadas que la pizarra (0 a 100). Antes del primer punto la pieza espera en
 * él y después del último se queda donde acabó. La voz empieza en el instante 0 de la animación.
 */

/** Dos minutos: lo que dura una explicación en la pista. */
export const ANIMATION_MAX_MS = 120_000;
/** Puntos entre todas las pistas: unas 20 muestras por segundo y pieza movida. */
export const ANIMATION_MAX_POINTS = 6000;
/** Intervalo mínimo entre muestras de una pieza al grabar. */
export const ANIMATION_SAMPLE_MS = 50;

/** Formatos de voz que graban los navegadores: Chrome y Firefox en WebM u Ogg, Safari en MP4. */
export const DRILL_AUDIO_CONTENT_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
] as const;
export type DrillAudioContentType = (typeof DRILL_AUDIO_CONTENT_TYPES)[number];
/** Dos minutos de voz en Opus ocupan menos de 1 MB; el margen cubre AAC y MP3. */
export const DRILL_AUDIO_MAX_BYTES = 4_000_000;

const Coord = z.number().min(0).max(100);
const Time = z.number().int().min(0).max(ANIMATION_MAX_MS);

export type AnimationPoint = [number, number, number];
export const AnimationPointSchema = z.tuple([Time, Coord, Coord]);

export const AnimationTrackSchema = z.object({
  /** Índice de la pieza en `pieces`. */
  piece: z.number().int().min(0).max(39),
  points: z.array(AnimationPointSchema).min(1).max(ANIMATION_MAX_POINTS),
});
export type AnimationTrack = z.infer<typeof AnimationTrackSchema>;

export const DiagramAnimationSchema = z
  .object({
    durationMs: z.number().int().min(1).max(ANIMATION_MAX_MS),
    tracks: z.array(AnimationTrackSchema).max(40),
  })
  .refine(
    (a) => a.tracks.reduce((sum, track) => sum + track.points.length, 0) <= ANIMATION_MAX_POINTS,
    { message: `Como mucho ${ANIMATION_MAX_POINTS} puntos entre todas las piezas.` },
  )
  .refine((a) => new Set(a.tracks.map((track) => track.piece)).size === a.tracks.length, {
    message: "Una pista por pieza.",
  })
  .refine(
    (a) =>
      a.tracks.every((track) =>
        track.points.every((p, i) => i === 0 || p[0] >= track.points[i - 1]![0]),
      ),
    { message: "Los puntos de cada pista van en orden de tiempo." },
  );
export type DiagramAnimation = z.infer<typeof DiagramAnimationSchema>;

export function isDrillAudioContentType(value: string): value is DrillAudioContentType {
  return (DRILL_AUDIO_CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * Tipo real del audio por sus primeros bytes: WebM (EBML), Ogg, MP4 (`ftyp`) o MP3 (ID3 o una
 * cabecera de trama). Evita guardar cualquier cosa con un content-type de audio falso.
 */
export function sniffAudioType(bytes: Uint8Array): DrillAudioContentType | null {
  const at = (i: number, ...values: number[]) => values.every((v, j) => bytes[i + j] === v);
  if (bytes.length >= 4 && at(0, 0x1a, 0x45, 0xdf, 0xa3)) return "audio/webm";
  if (bytes.length >= 4 && at(0, 0x4f, 0x67, 0x67, 0x53)) return "audio/ogg";
  if (bytes.length >= 8 && at(4, 0x66, 0x74, 0x79, 0x70)) return "audio/mp4";
  if (bytes.length >= 3 && at(0, 0x49, 0x44, 0x33)) return "audio/mpeg";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return "audio/mpeg";
  return null;
}

/** Posición de una pista en el instante `t`, interpolando en línea recta entre sus puntos. */
export function positionAt(points: readonly AnimationPoint[], t: number): { x: number; y: number } {
  const first = points[0];
  if (!first) return { x: 0, y: 0 };
  if (t <= first[0]) return { x: first[1], y: first[2] };
  const last = points[points.length - 1]!;
  if (t >= last[0]) return { x: last[1], y: last[2] };
  // Búsqueda binaria del último punto anterior a `t`.
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid]![0] <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo]!;
  const b = points[hi]!;
  const span = b[0] - a[0];
  const k = span > 0 ? (t - a[0]) / span : 1;
  return { x: a[1] + (b[1] - a[1]) * k, y: a[2] + (b[2] - a[2]) * k };
}

/** Las piezas de la pizarra en el instante `t`: las que tienen pista, donde marca; el resto, quietas. */
export function piecesAt<P extends { x: number; y: number }>(
  pieces: readonly P[],
  animation: DiagramAnimation | undefined,
  t: number,
): P[] {
  if (!animation) return [...pieces];
  const byPiece = new Map(animation.tracks.map((track) => [track.piece, track.points]));
  return pieces.map((piece, i) => {
    const points = byPiece.get(i);
    return points ? { ...piece, ...positionAt(points, t) } : piece;
  });
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n * 10) / 10));

/** Mover una pieza fuera de la grabación mueve su trayectoria entera: se conserva el dibujo. */
export function offsetTrack(
  animation: DiagramAnimation,
  piece: number,
  dx: number,
  dy: number,
): DiagramAnimation {
  return {
    ...animation,
    tracks: animation.tracks.map((track) =>
      track.piece === piece
        ? {
            ...track,
            points: track.points.map(
              ([t, x, y]) => [t, clamp(x + dx), clamp(y + dy)] as AnimationPoint,
            ),
          }
        : track,
    ),
  };
}

/** Al quitar una pieza se va su pista y las de detrás bajan un puesto, como la propia pieza. */
export function withoutPiece(
  animation: DiagramAnimation | undefined,
  piece: number,
): DiagramAnimation | undefined {
  if (!animation) return undefined;
  const tracks = animation.tracks
    .filter((track) => track.piece !== piece)
    .map((track) => (track.piece > piece ? { ...track, piece: track.piece - 1 } : track));
  return tracks.length > 0 ? { ...animation, tracks } : undefined;
}

/**
 * Grabación por capas: lo grabado antes en una pieza se conserva hasta el instante en que se
 * vuelve a coger y desde ahí manda lo nuevo. Sin pista previa, la pieza espera en su sitio.
 */
export function punchIn(
  previous: readonly AnimationPoint[] | undefined,
  base: { x: number; y: number },
  grabbedAt: number,
  samples: readonly AnimationPoint[],
): AnimationPoint[] {
  const kept = previous
    ? previous.filter((p) => p[0] < grabbedAt)
    : [[0, clamp(base.x), clamp(base.y)] as AnimationPoint];
  return [...kept, ...samples];
}

/** Redondea y limita una animación recién grabada para que pase la validación. */
export function finishAnimation(
  tracks: readonly AnimationTrack[],
  durationMs: number,
): DiagramAnimation | undefined {
  const clean = tracks
    .map((track) => ({
      piece: track.piece,
      points: track.points
        .map(
          ([t, x, y]) =>
            [
              Math.min(ANIMATION_MAX_MS, Math.max(0, Math.round(t))),
              clamp(x),
              clamp(y),
            ] as AnimationPoint,
        )
        .sort((a, b) => a[0] - b[0]),
    }))
    .filter((track) => track.points.length > 0);
  if (clean.length === 0) return undefined;
  // Si se pasa del tope de puntos, se aclaran las pistas por igual (una de cada dos, y así).
  const thin = (step: number) =>
    clean.map((track) => ({
      ...track,
      points: track.points.filter((_, i) => i % step === 0 || i === track.points.length - 1),
    }));
  const count = (list: typeof clean) => list.reduce((sum, track) => sum + track.points.length, 0);
  let step = 1;
  let thinned = clean;
  while (count(thinned) > ANIMATION_MAX_POINTS) thinned = thin(++step);
  const last = Math.max(1, ...thinned.flatMap((track) => track.points.map((p) => p[0])));
  return {
    durationMs: Math.min(ANIMATION_MAX_MS, Math.max(Math.round(durationMs), last)),
    tracks: thinned,
  };
}
