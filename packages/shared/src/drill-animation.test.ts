import { describe, expect, it } from "vitest";
import {
  ANIMATION_MAX_POINTS,
  DiagramAnimationSchema,
  finishAnimation,
  offsetTrack,
  piecesAt,
  positionAt,
  punchIn,
  sniffAudioType,
  withoutPiece,
  type AnimationPoint,
  type DiagramAnimation,
} from "./drill-animation.ts";
import { DrillDiagramSchema } from "./training.ts";

const track: AnimationPoint[] = [
  [0, 10, 10],
  [1000, 20, 10],
  [3000, 20, 50],
];

describe("pizarra animada", () => {
  it("interpola en línea recta y espera antes y después de la pista", () => {
    expect(positionAt(track, -5)).toEqual({ x: 10, y: 10 });
    expect(positionAt(track, 500)).toEqual({ x: 15, y: 10 });
    expect(positionAt(track, 2000)).toEqual({ x: 20, y: 30 });
    expect(positionAt(track, 9000)).toEqual({ x: 20, y: 50 });
  });

  it("solo mueve las piezas que tienen pista", () => {
    const pieces = [
      { kind: "own", x: 10, y: 10 },
      { kind: "ball", x: 50, y: 50 },
    ];
    const animation: DiagramAnimation = { durationMs: 3000, tracks: [{ piece: 0, points: track }] };
    expect(piecesAt(pieces, animation, 1000)).toEqual([
      { kind: "own", x: 20, y: 10 },
      { kind: "ball", x: 50, y: 50 },
    ]);
    expect(piecesAt(pieces, undefined, 1000)).toEqual(pieces);
  });

  it("al mover una pieza fuera de la grabación su trayectoria se desplaza entera, sin salirse", () => {
    const animation: DiagramAnimation = { durationMs: 3000, tracks: [{ piece: 0, points: track }] };
    expect(offsetTrack(animation, 0, 85, -15).tracks[0]!.points).toEqual([
      [0, 95, 0],
      [1000, 100, 0],
      [3000, 100, 35],
    ]);
  });

  it("al quitar una pieza se va su pista y las de detrás bajan un puesto", () => {
    const animation: DiagramAnimation = {
      durationMs: 3000,
      tracks: [
        { piece: 0, points: track },
        { piece: 2, points: track },
      ],
    };
    expect(withoutPiece(animation, 1)!.tracks.map((t) => t.piece)).toEqual([0, 1]);
    expect(
      withoutPiece({ durationMs: 10, tracks: [{ piece: 0, points: track }] }, 0),
    ).toBeUndefined();
  });

  it("grabar por capas conserva lo anterior hasta que se vuelve a coger la pieza", () => {
    expect(punchIn(track, { x: 0, y: 0 }, 2000, [[2000, 30, 30]])).toEqual([
      [0, 10, 10],
      [1000, 20, 10],
      [2000, 30, 30],
    ]);
    expect(punchIn(undefined, { x: 5, y: 6 }, 800, [[800, 7, 8]])).toEqual([
      [0, 5, 6],
      [800, 7, 8],
    ]);
  });

  it("una grabación larga se aclara hasta caber y siempre pasa la validación", () => {
    const long = Array.from(
      { length: 5000 },
      (_, i) => [i * 10, (i % 100) + 0.04, 50] as AnimationPoint,
    );
    const finished = finishAnimation(
      [
        { piece: 0, points: long },
        { piece: 1, points: long },
      ],
      49_990,
    )!;
    const total = finished.tracks.reduce((sum, t) => sum + t.points.length, 0);
    expect(total).toBeLessThanOrEqual(ANIMATION_MAX_POINTS);
    expect(finished.tracks[0]!.points.at(-1)![0]).toBe(49_990);
    expect(DiagramAnimationSchema.safeParse(finished).success).toBe(true);
    expect(finishAnimation([], 1000)).toBeUndefined();
  });

  it("la pizarra rechaza pistas de piezas que no existen o puntos desordenados", () => {
    const base = { field: "half", pieces: [{ kind: "own", x: 10, y: 10 }], arrows: [] };
    const ok = { ...base, animation: { durationMs: 3000, tracks: [{ piece: 0, points: track }] } };
    expect(DrillDiagramSchema.safeParse(ok).success).toBe(true);
    expect(
      DrillDiagramSchema.safeParse({
        ...base,
        animation: { durationMs: 3000, tracks: [{ piece: 1, points: track }] },
      }).success,
    ).toBe(false);
    expect(
      DrillDiagramSchema.safeParse({
        ...base,
        animation: { durationMs: 3000, tracks: [{ piece: 0, points: [...track].reverse() }] },
      }).success,
    ).toBe(false);
  });

  it("reconoce el audio por sus primeros bytes", () => {
    expect(sniffAudioType(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1]))).toBe("audio/webm");
    expect(sniffAudioType(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0]))).toBe("audio/ogg");
    expect(sniffAudioType(new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]))).toBe(
      "audio/mp4",
    );
    expect(sniffAudioType(new Uint8Array([0x49, 0x44, 0x33]))).toBe("audio/mpeg");
    expect(sniffAudioType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});
