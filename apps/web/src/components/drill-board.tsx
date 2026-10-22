import {
  ANIMATION_MAX_MS,
  ANIMATION_SAMPLE_MS,
  finishAnimation,
  offsetTrack,
  piecesAt,
  punchIn,
  withoutPiece,
  type AnimationPoint,
  type DiagramAnimation,
  type DiagramArrowKind,
  type DiagramField,
  type DiagramPieceKind,
  type DrillDiagram,
} from "@sportsmanager/shared";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useT } from "@/lib/intl";
import { Button, Icon, IconButton } from "@/ui";

/**
 * Pizarra de la tarea (ADR 0039 y 0040): la vista, el reproductor de la jugada y el editor. Las
 * piezas se ponen con un toque y se arrastran con el dedo o el ratón (con varios dedos a la vez);
 * el movimiento se graba por capas y, si se quiere, con la voz de quien lo explica. SVG propio.
 */

type Pt = { x: number; y: number };
type BoardPiece = DrillDiagram["pieces"][number];

const CLUB = "var(--club-fill)";
const REFERENCE = "var(--chart-reference)";
const INK = "var(--text)";

export const FIELD_BOX: Record<DiagramField, { w: number; h: number }> = {
  full: { w: 200, h: 100 },
  half: { w: 100, h: 100 },
  free: { w: 100, h: 100 },
};

export const EMPTY_DIAGRAM: DrillDiagram = { field: "half", pieces: [], arrows: [] };

const round1 = (n: number) => Math.round(Math.max(0, Math.min(100, n)) * 10) / 10;

function CourtLines({ field }: { field: DiagramField }) {
  const { w, h } = FIELD_BOX[field];
  const line = { stroke: "var(--border)", strokeWidth: 0.8, fill: "none" };
  if (field === "free") return null;
  if (field === "half")
    return (
      <g>
        <rect x={1} y={1} width={w - 2} height={h - 2} {...line} />
        {/* Medio círculo central en la línea de medio campo, el área y la portería que se ataca. */}
        <path d={`M 1 ${h / 2 - 15} A 15 15 0 0 1 1 ${h / 2 + 15}`} {...line} />
        <path d={`M ${w - 1} ${h / 2 - 30} A 30 30 0 0 0 ${w - 1} ${h / 2 + 30}`} {...line} />
        <rect x={w - 3} y={h / 2 - 8} width={2} height={16} fill="var(--text-muted)" />
      </g>
    );
  return (
    <g>
      <rect x={1} y={1} width={w - 2} height={h - 2} {...line} />
      <line x1={w / 2} x2={w / 2} y1={1} y2={h - 1} {...line} />
      <circle cx={w / 2} cy={h / 2} r={12} {...line} />
      <path d={`M 1 ${h / 2 - 30} A 30 30 0 0 1 1 ${h / 2 + 30}`} {...line} />
      <path d={`M ${w - 1} ${h / 2 - 30} A 30 30 0 0 0 ${w - 1} ${h / 2 + 30}`} {...line} />
      <rect x={1} y={h / 2 - 8} width={2} height={16} fill="var(--text-muted)" />
      <rect x={w - 3} y={h / 2 - 8} width={2} height={16} fill="var(--text-muted)" />
    </g>
  );
}

function arrowPath(kind: DiagramArrowKind, x1: number, y1: number, x2: number, y2: number) {
  if (kind !== "dribble") return `M ${x1} ${y1} L ${x2} ${y2}`;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(2, Math.floor(len / 5));
  const nx = -(y2 - y1) / (len || 1);
  const ny = (x2 - x1) / (len || 1);
  let d = `M ${x1} ${y1}`;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const amp = i === steps ? 0 : i % 2 === 0 ? 1.8 : -1.8;
    d += ` L ${x1 + (x2 - x1) * t + nx * amp} ${y1 + (y2 - y1) * t + ny * amp}`;
  }
  return d;
}

const pieceColor = (kind: DiagramPieceKind) =>
  kind === "rival"
    ? REFERENCE
    : kind === "keeper"
      ? "var(--club-deep)"
      : kind === "own"
        ? CLUB
        : INK;

function Piece({
  kind,
  x,
  y,
  label,
  selected = false,
}: {
  kind: DiagramPieceKind;
  x: number;
  y: number;
  label?: string | undefined;
  selected?: boolean;
}) {
  const ring = selected ? (
    <circle
      cx={x}
      cy={y}
      r={6.2}
      fill="none"
      stroke="var(--club-deep)"
      strokeWidth={0.7}
      strokeDasharray="1.4 1"
    />
  ) : null;
  switch (kind) {
    case "ball":
      return (
        <g>
          {ring}
          <circle cx={x} cy={y} r={2} fill="#fff" stroke={INK} strokeWidth={0.7} />
        </g>
      );
    case "cone":
      return (
        <g>
          {ring}
          <path
            d={`M ${x} ${y - 3} L ${x + 2.6} ${y + 2} L ${x - 2.6} ${y + 2} Z`}
            fill="var(--status-warning-text)"
          />
        </g>
      );
    case "goal":
      return (
        <g>
          {ring}
          <rect x={x - 1.2} y={y - 6} width={2.4} height={12} fill={INK} rx={0.6} />
        </g>
      );
    default:
      return (
        <g>
          {ring}
          <circle
            cx={x}
            cy={y}
            r={4}
            fill={pieceColor(kind)}
            stroke={kind === "keeper" ? "#fff" : "none"}
            strokeWidth={0.8}
          />
          {label ? (
            <text x={x} y={y + 1.6} fontSize={4.2} textAnchor="middle" fill="#fff" fontWeight={700}>
              {label}
            </text>
          ) : null}
        </g>
      );
  }
}

/** Trayectorias grabadas, finas y discontinuas: en papel y en miniatura dicen por dónde va cada pieza. */
function Trails({ diagram, sx }: { diagram: DrillDiagram; sx: number }) {
  if (!diagram.animation) return null;
  return (
    <g opacity={0.6}>
      {diagram.animation.tracks.map((track) => {
        const piece = diagram.pieces[track.piece];
        if (!piece || track.points.length < 2) return null;
        return (
          <polyline
            key={track.piece}
            points={track.points.map(([, x, y]) => `${x * sx},${y}`).join(" ")}
            fill="none"
            stroke={pieceColor(piece.kind)}
            strokeWidth={0.7}
            strokeDasharray="1.6 1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </g>
  );
}

type BoardPointer = (e: PointerEvent<SVGSVGElement>, at: Pt) => void;

/**
 * La pizarra: pista, flechas, piezas y, si la jugada tiene movimiento, sus trayectorias. `pieces`
 * sustituye las posiciones (un instante de la animación o una pieza arrastrándose).
 */
export function DrillBoard({
  diagram,
  label,
  className = "",
  children,
  pieces,
  trails = true,
  selected = null,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  diagram: DrillDiagram;
  label: string;
  className?: string;
  children?: ReactNode;
  pieces?: readonly BoardPiece[];
  trails?: boolean;
  selected?: number | null;
  onPointerDown?: BoardPointer;
  onPointerMove?: BoardPointer;
  onPointerUp?: BoardPointer;
}) {
  const { w, h } = FIELD_BOX[diagram.field];
  const sx = w / 100;
  const marker = `drill-arrow-${useId().replace(/:/g, "")}`;
  /** Del puntero a la pizarra (0 a 100), también cuando el SVG queda con bandas a los lados. */
  const toBoard = (e: PointerEvent<SVGSVGElement>): Pt => {
    const ctm = e.currentTarget.getScreenCTM();
    if (ctm) {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      return { x: round1(p.x / sx), y: round1(p.y) };
    }
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: round1(((e.clientX - rect.left) / rect.width) * 100),
      y: round1(((e.clientY - rect.top) / rect.height) * 100),
    };
  };
  const shown = pieces ?? diagram.pieces;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`h-auto w-full rounded-field bg-raised ${className}`}
      role="img"
      aria-label={label}
      onPointerDown={onPointerDown ? (e) => onPointerDown(e, toBoard(e)) : undefined}
      onPointerMove={onPointerMove ? (e) => onPointerMove(e, toBoard(e)) : undefined}
      onPointerUp={onPointerUp ? (e) => onPointerUp(e, toBoard(e)) : undefined}
      onPointerCancel={onPointerUp ? (e) => onPointerUp(e, toBoard(e)) : undefined}
    >
      <defs>
        <marker
          id={marker}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={INK} />
        </marker>
      </defs>
      <CourtLines field={diagram.field} />
      {trails ? <Trails diagram={diagram} sx={sx} /> : null}
      {diagram.arrows.map((a, i) => (
        <path
          key={`a${i}`}
          d={arrowPath(a.kind, a.x1 * sx, a.y1, a.x2 * sx, a.y2)}
          fill="none"
          stroke={INK}
          strokeWidth={0.8}
          strokeDasharray={a.kind === "run" ? "2.2 1.6" : undefined}
          markerEnd={`url(#${marker})`}
        />
      ))}
      {shown.map((p, i) => (
        <Piece
          key={`p${i}`}
          kind={p.kind}
          x={p.x * sx}
          y={p.y}
          label={p.label}
          selected={selected === i}
        />
      ))}
      {children}
    </svg>
  );
}

// --- Reproducción ---

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Reloj de la jugada. Con voz, manda el audio: si se adelanta o se retrasa más de una décima,
 * el reloj se ajusta a él. Si la voz acaba antes, el movimiento sigue con el reloj.
 */
export function usePlayback(durationMs: number, audioSrc: string | null) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioMs, setAudioMs] = useState(0);
  const audio = useMemo(() => (audioSrc ? new Audio(audioSrc) : null), [audioSrc]);
  const frame = useRef(0);
  const started = useRef(0);
  const current = useRef(0);
  // La voz grabada en WebM no siempre trae la duración (Infinity): entonces manda el movimiento.
  const total = Math.max(durationMs, Number.isFinite(audioMs) ? audioMs : 0);
  const totalRef = useRef(total);
  totalRef.current = total;

  useEffect(() => {
    if (!audio) return;
    audio.preload = "auto";
    const onMeta = () => setAudioMs(audio.duration * 1000);
    audio.addEventListener("loadedmetadata", onMeta);
    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.pause();
    };
  }, [audio]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const pause = useCallback(() => {
    cancelAnimationFrame(frame.current);
    audio?.pause();
    setPlaying(false);
  }, [audio]);

  const tick = useCallback(() => {
    const now = performance.now();
    let next = now - started.current;
    if (audio && !audio.paused && !audio.ended) {
      const heard = audio.currentTime * 1000;
      if (Math.abs(heard - next) > 100) {
        started.current = now - heard;
        next = heard;
      }
    }
    if (next >= totalRef.current) {
      current.current = totalRef.current;
      setT(totalRef.current);
      pause();
      return;
    }
    current.current = next;
    setT(next);
    frame.current = requestAnimationFrame(tick);
  }, [audio, pause]);

  const play = useCallback(() => {
    const from = current.current >= totalRef.current ? 0 : current.current;
    current.current = from;
    started.current = performance.now() - from;
    if (audio) {
      audio.currentTime = from / 1000;
      void audio.play().catch(() => undefined);
    }
    setPlaying(true);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(tick);
  }, [audio, tick]);

  const seek = useCallback(
    (ms: number) => {
      current.current = ms;
      started.current = performance.now() - ms;
      setT(ms);
      if (audio) audio.currentTime = ms / 1000;
    },
    [audio],
  );

  return { t, playing, total, play, pause, seek };
}

type Playback = ReturnType<typeof usePlayback>;

/** Mandos de la jugada: reproducir o parar, volver al principio y la línea de tiempo. */
function PlaybackBar({
  pb,
  hasVoice,
  disabled = false,
}: {
  pb: Playback;
  hasVoice: boolean;
  disabled?: boolean;
}) {
  const t = useT("board");
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("player")}>
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled}
        icon={
          pb.playing ? (
            <Icon.Pause size={16} aria-hidden="true" />
          ) : (
            <Icon.Play size={16} aria-hidden="true" />
          )
        }
        onClick={() => (pb.playing ? pb.pause() : pb.play())}
      >
        {pb.playing ? t("pause") : t("play")}
      </Button>
      <IconButton
        label={t("restart")}
        disabled={disabled || (pb.t === 0 && !pb.playing)}
        onClick={() => {
          pb.pause();
          pb.seek(0);
        }}
      >
        <Icon.ArrowCounterClockwise size={18} aria-hidden="true" />
      </IconButton>
      <input
        type="range"
        min={0}
        max={pb.total}
        step={100}
        value={Math.round(pb.t)}
        disabled={disabled}
        aria-label={t("timeline")}
        aria-valuetext={`${clock(pb.t)} / ${clock(pb.total)}`}
        onChange={(e) => pb.seek(Number(e.target.value))}
        className="h-2 min-w-24 flex-1 accent-club"
      />
      <span className="font-mono text-secondary text-muted tabular">
        {clock(pb.t)} / {clock(pb.total)}
      </span>
      {hasVoice ? (
        <span className="inline-flex items-center gap-1 text-secondary text-muted">
          <Icon.Microphone size={16} aria-hidden="true" />
          {t("withVoice")}
        </span>
      ) : null}
    </div>
  );
}

/**
 * La pizarra con su jugada: sin movimiento es la pizarra de siempre; con él, mandos para
 * reproducirla con la voz. Parada, enseña las trayectorias.
 */
export function DrillAnimationPlayer({
  diagram,
  audioUrl = null,
  label,
  className = "",
}: {
  diagram: DrillDiagram;
  audioUrl?: string | null;
  label: string;
  className?: string;
}) {
  if (!diagram.animation)
    return <DrillBoard diagram={diagram} label={label} className={className} />;
  return (
    <AnimatedBoard
      diagram={diagram}
      animation={diagram.animation}
      audioUrl={audioUrl}
      label={label}
      className={className}
    />
  );
}

function AnimatedBoard({
  diagram,
  animation,
  audioUrl,
  label,
  className,
}: {
  diagram: DrillDiagram;
  animation: DiagramAnimation;
  audioUrl: string | null;
  label: string;
  className: string;
}) {
  const pb = usePlayback(animation.durationMs, audioUrl);
  return (
    <div className="flex flex-col gap-2">
      <DrillBoard
        diagram={diagram}
        pieces={piecesAt(diagram.pieces, animation, pb.t)}
        trails={!pb.playing && pb.t === 0}
        label={label}
        className={className}
      />
      <PlaybackBar pb={pb} hasVoice={Boolean(audioUrl)} />
    </div>
  );
}

// --- Editor ---

type Tool = DiagramPieceKind | DiagramArrowKind | "erase";
const PIECE_TOOLS: DiagramPieceKind[] = ["own", "rival", "keeper", "ball", "cone", "goal"];
const ARROW_TOOLS: DiagramArrowKind[] = ["pass", "dribble", "run"];
const isArrowTool = (tool: Tool): tool is DiagramArrowKind =>
  (ARROW_TOOLS as string[]).includes(tool);

/** Una pieza cogida: de dónde salió, dónde se tocó respecto a su centro y si ya se ha movido. */
type Drag = { piece: number; at: Pt; from: Pt; dx: number; dy: number; moved: boolean };

/** Una capa en grabación: el reloj, lo que se va moviendo y el micrófono si graba voz. */
type Take = {
  startedAt: number;
  frame: number;
  tracks: Map<number, { grabbedAt: number; samples: AnimationPoint[]; last: number }>;
  recorder: MediaRecorder | null;
  stream: MediaStream | null;
  chunks: Blob[];
  /** La voz ya guardada suena mientras se graba solo movimiento, para encajarlo con ella. */
  backing: HTMLAudioElement | null;
};

/** Mejor formato de voz que graba este navegador (Safari solo MP4). */
const recorderType = () =>
  ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );

const canRecordVoice = () =>
  typeof window !== "undefined" &&
  typeof window.MediaRecorder !== "undefined" &&
  typeof navigator.mediaDevices?.getUserMedia === "function";

/** URL temporal de la voz recién grabada, que se libera al cambiar o al salir. */
function useObjectUrl(blob: Blob | null | undefined) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  return url;
}

/**
 * Editor de la pizarra. Se elige una herramienta y se toca la pista: las piezas se ponen con un
 * toque y las flechas con dos (origen y destino). Cualquier pieza se arrastra; fuera de la
 * grabación, su trayectoria va con ella. "Grabar movimiento" registra lo que se arrastra mientras
 * se reproduce lo ya grabado (capas) y, con "Con voz", la explicación. La lista de debajo es la vía
 * del teclado y del lector de pantalla: se elige una pieza y se mueve con las flechas.
 */
export function DrillBoardEditor({
  value,
  onChange,
  audio,
  onAudioChange,
}: {
  value: DrillDiagram;
  onChange: (value: DrillDiagram) => void;
  /** Voz actual: la recién grabada (aún sin guardar) o la guardada. */
  audio?: { blob: Blob | null; url: string | null };
  /** Voz nueva, o nula para quitarla. Sin esta función no se ofrece grabar voz. */
  onAudioChange?: (blob: Blob | null) => void;
}) {
  const t = useT("board");
  const [tool, setTool] = useState<Tool>("own");
  const [start, setStart] = useState<Pt | null>(null);
  const [nextLabel, setNextLabel] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [live, setLive] = useState<ReadonlyMap<number, Pt>>(new Map());
  const [recording, setRecording] = useState<null | { phase: "starting" | "on"; t: number }>(null);
  const [withVoice, setWithVoice] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const drags = useRef(new Map<number, Drag>());
  const take = useRef<Take | null>(null);
  // Lo que leen el reloj de la grabación y los manejadores, siempre al día.
  const latest = useRef({ value, onChange, onAudioChange, live });
  latest.current = { value, onChange, onAudioChange, live };

  const freshUrl = useObjectUrl(audio?.blob);
  const voiceUrl = freshUrl ?? audio?.url ?? null;
  const voiceOk = Boolean(onAudioChange) && canRecordVoice();
  const pb = usePlayback(value.animation?.durationMs ?? 1, voiceUrl);
  const busy = recording !== null || pb.playing;
  const sx = FIELD_BOX[value.field].w / 100;

  // Si la pizarra se cierra a media grabación, se apaga el micrófono.
  useEffect(
    () => () => {
      const current = take.current;
      if (!current) return;
      cancelAnimationFrame(current.frame);
      if (current.recorder?.state === "recording") current.recorder.stop();
      current.stream?.getTracks().forEach((track) => track.stop());
      current.backing?.pause();
    },
    [],
  );

  // --- Lo que se ve: el instante de la jugada y, encima, lo que se está arrastrando ---
  const tNow = recording ? recording.t : pb.t;
  const animating = recording !== null || pb.playing || pb.t > 0;
  const shown: BoardPiece[] = (
    animating ? piecesAt(value.pieces, value.animation, tNow) : value.pieces
  ).map((piece, i) => {
    const dragging = live.get(i);
    if (dragging) return { ...piece, ...dragging };
    const inTake = recording ? take.current?.tracks.get(i)?.samples.at(-1) : undefined;
    return inTake ? { ...piece, x: inTake[1], y: inTake[2] } : piece;
  });

  const hitPiece = (at: Pt): number => {
    let best = -1;
    let bestD = Infinity;
    shown.forEach((p, i) => {
      const d = Math.hypot((p.x - at.x) * sx, p.y - at.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return bestD <= 6 ? best : -1;
  };

  /** Fuera de la grabación, mover una pieza mueve también su trayectoria. */
  function commitMove(index: number, to: Pt) {
    const piece = value.pieces[index];
    if (!piece) return;
    const x = round1(to.x);
    const y = round1(to.y);
    onChange({
      ...value,
      pieces: value.pieces.map((p, i) => (i === index ? { ...p, x, y } : p)),
      ...(value.animation
        ? { animation: offsetTrack(value.animation, index, x - piece.x, y - piece.y) }
        : {}),
    });
  }

  function removePiece(index: number) {
    const animation = withoutPiece(value.animation, index);
    const { animation: _old, ...rest } = value;
    onChange({
      ...rest,
      pieces: value.pieces.filter((_, i) => i !== index),
      ...(animation ? { animation } : {}),
    });
    if (!animation && value.animation) onAudioChange?.(null);
    setSelected((s) => (s === index ? null : s !== null && s > index ? s - 1 : s));
  }

  /** Toque en la pista vacía con la herramienta elegida. */
  function tap(at: Pt) {
    const { x, y } = at;
    if (tool === "erase") {
      const dist = (px: number, py: number) => Math.hypot((px - x) * sx, py - y);
      const piece = value.pieces
        .map((p, i) => ({ i, d: dist(p.x, p.y) }))
        .sort((a, b) => a.d - b.d)[0];
      const arrow = value.arrows
        .map((a, i) => ({
          i,
          d: Math.min(
            dist(a.x1, a.y1),
            dist(a.x2, a.y2),
            dist((a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2),
          ),
        }))
        .sort((a, b) => a.d - b.d)[0];
      if (piece && (!arrow || piece.d <= arrow.d) && piece.d < 10) removePiece(piece.i);
      else if (arrow && arrow.d < 10)
        onChange({ ...value, arrows: value.arrows.filter((_, i) => i !== arrow.i) });
      return;
    }
    if (isArrowTool(tool)) {
      if (!start) {
        setStart({ x, y });
        return;
      }
      if (value.arrows.length < 40)
        onChange({
          ...value,
          arrows: [...value.arrows, { kind: tool, x1: start.x, y1: start.y, x2: x, y2: y }],
        });
      setStart(null);
      return;
    }
    if (value.pieces.length >= 40) return;
    const label = tool === "own" ? String(nextLabel) : undefined;
    if (tool === "own") setNextLabel((n) => (n % 9) + 1);
    onChange({
      ...value,
      pieces: [...value.pieces, { kind: tool, x, y, ...(label ? { label } : {}) }],
    });
  }

  // --- Grabación ---

  /** Una muestra de la pieza: como mucho una cada 50 ms, salvo al cogerla y al soltarla. */
  function sample(index: number, at: Pt, force: boolean) {
    const current = take.current;
    if (!current) return;
    const ms = Math.min(ANIMATION_MAX_MS, performance.now() - current.startedAt);
    let track = current.tracks.get(index);
    if (!track) {
      track = { grabbedAt: Math.round(ms), samples: [], last: -Infinity };
      current.tracks.set(index, track);
    }
    if (!force && ms - track.last < ANIMATION_SAMPLE_MS) return;
    track.samples.push([Math.round(ms), round1(at.x), round1(at.y)]);
    track.last = ms;
  }

  async function startRecording() {
    pb.pause();
    pb.seek(0);
    setSelected(null);
    setStart(null);
    setNotice(null);
    let recorder: MediaRecorder | null = null;
    let stream: MediaStream | null = null;
    const chunks: Blob[] = [];
    if (withVoice && voiceOk) {
      setRecording({ phase: "starting", t: 0 });
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const type = recorderType();
        recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.start();
      } catch {
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        recorder = null;
        setNotice(t("micDenied"));
      }
    }
    // Grabando solo movimiento, la voz guardada suena de fondo para encajarlo con ella.
    const backing = !recorder && voiceUrl ? new Audio(voiceUrl) : null;
    if (backing) void backing.play().catch(() => undefined);
    const current: Take = {
      startedAt: performance.now(),
      frame: 0,
      tracks: new Map(),
      recorder,
      stream,
      chunks,
      backing,
    };
    take.current = current;
    const loop = () => {
      if (take.current !== current) return;
      const ms = performance.now() - current.startedAt;
      if (ms >= ANIMATION_MAX_MS) {
        void stopRecording();
        return;
      }
      setRecording({ phase: "on", t: ms });
      current.frame = requestAnimationFrame(loop);
    };
    setRecording({ phase: "on", t: 0 });
    current.frame = requestAnimationFrame(loop);
  }

  async function stopRecording() {
    const current = take.current;
    if (!current) return;
    take.current = null;
    cancelAnimationFrame(current.frame);
    current.backing?.pause();
    const ms = Math.min(ANIMATION_MAX_MS, performance.now() - current.startedAt);
    const {
      value: diagram,
      onChange: change,
      onAudioChange: changeAudio,
      live: dragging,
    } = latest.current;
    // Lo que sigue cogido al parar se suelta donde está.
    for (const drag of drags.current.values()) {
      const at = dragging.get(drag.piece);
      const track = current.tracks.get(drag.piece);
      if (at && track) track.samples.push([Math.round(ms), round1(at.x), round1(at.y)]);
    }
    drags.current.clear();
    setLive(new Map());
    setRecording(null);

    const before = diagram.animation;
    const tracks = new Map(before?.tracks.map((tr) => [tr.piece, tr.points]) ?? []);
    for (const [index, pass] of current.tracks) {
      const base = diagram.pieces[index];
      if (base) tracks.set(index, punchIn(tracks.get(index), base, pass.grabbedAt, pass.samples));
    }
    const moved = current.tracks.size > 0;
    if (moved) {
      const animation = finishAnimation(
        [...tracks].map(([piece, points]) => ({ piece, points })),
        Math.max(before?.durationMs ?? 0, ms),
      );
      if (animation) change({ ...diagram, animation });
    }
    if (current.recorder) {
      const recorder = current.recorder;
      const blob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () =>
          resolve(new Blob(current.chunks, { type: recorder.mimeType || "audio/webm" }));
        recorder.stop();
      });
      current.stream?.getTracks().forEach((track) => track.stop());
      // La voz solo tiene sentido con movimiento: el de esta capa o el de antes.
      if (blob.size > 0 && (moved || before)) changeAudio?.(blob);
    }
    if (!moved && !(current.recorder && before)) setNotice(t("nothingRecorded"));
  }

  // --- Punteros ---

  const onDown: BoardPointer = (e, at) => {
    if (pb.playing || recording?.phase === "starting") return;
    if (!recording && pb.t > 0) pb.seek(0);
    const index = tool === "erase" && !recording ? -1 : hitPiece(at);
    if (index >= 0) {
      e.currentTarget.setPointerCapture(e.pointerId);
      const from = shown[index]!;
      drags.current.set(e.pointerId, {
        piece: index,
        at,
        from: { x: from.x, y: from.y },
        dx: at.x - from.x,
        dy: at.y - from.y,
        moved: false,
      });
      setSelected(index);
      if (recording) sample(index, from, true);
      return;
    }
    // Grabando, la pista solo sirve para mover piezas.
    if (!recording) tap(at);
  };

  const onMove: BoardPointer = (e, at) => {
    const drag = drags.current.get(e.pointerId);
    if (!drag) return;
    const to = { x: round1(at.x - drag.dx), y: round1(at.y - drag.dy) };
    if (!drag.moved && Math.hypot((to.x - drag.from.x) * sx, to.y - drag.from.y) < 1) return;
    drag.moved = true;
    setLive((prev) => new Map(prev).set(drag.piece, to));
    if (recording) sample(drag.piece, to, false);
  };

  const onUp: BoardPointer = (e) => {
    const drag = drags.current.get(e.pointerId);
    if (!drag) return;
    drags.current.delete(e.pointerId);
    const to = latest.current.live.get(drag.piece);
    setLive((prev) => {
      const next = new Map(prev);
      next.delete(drag.piece);
      return next;
    });
    if (recording) {
      if (to) sample(drag.piece, to, true);
      return;
    }
    // Un toque sin arrastre sobre una pieza: con una flecha, es su origen o su destino.
    if (!drag.moved) {
      if (isArrowTool(tool)) tap(drag.at);
      return;
    }
    if (to) commitMove(drag.piece, to);
  };

  /** Teclado: con una pieza de la lista elegida, las flechas la mueven (con Mayúsculas, más). */
  function nudge(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = e.shiftKey ? 5 : 1;
    const delta: Record<string, Pt> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const d = delta[e.key];
    const piece = value.pieces[index];
    if (!d || !piece || busy) return;
    e.preventDefault();
    setSelected(index);
    commitMove(index, { x: piece.x + d.x, y: piece.y + d.y });
  }

  function clearMovement() {
    pb.pause();
    pb.seek(0);
    const { animation: _a, ...rest } = value;
    onChange(rest);
    onAudioChange?.(null);
  }

  const toolButton = (key: Tool, icon: ReactNode) => (
    <button
      key={key}
      type="button"
      aria-pressed={tool === key}
      disabled={busy}
      onClick={() => {
        setTool(key);
        setStart(null);
      }}
      className={`inline-flex h-10 items-center gap-1.5 rounded-control px-3 text-secondary font-medium disabled:opacity-50 ${
        tool === key ? "bg-club text-on-club" : "bg-raised text-ink hover:bg-club-soft"
      }`}
    >
      {icon}
      {t(`tools.${key}`)}
    </button>
  );

  const pieceName = (p: BoardPiece) => `${t(`tools.${p.kind}`)}${p.label ? ` ${p.label}` : ""}`;
  const hint = recording
    ? recording.phase === "starting"
      ? t("preparingMic")
      : t("recordHint")
    : start
      ? t("arrowEnd")
      : isArrowTool(tool)
        ? `${t("arrowStart")} ${t("dragHint")}`
        : tool === "erase"
          ? t("eraseHint")
          : `${t("pieceHint")} ${t("dragHint")}`;
  const hasVoice = Boolean(voiceUrl);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t("toolbar")}>
        {PIECE_TOOLS.map((k) => toolButton(k, null))}
        {ARROW_TOOLS.map((k) => toolButton(k, null))}
        {toolButton("erase", <Icon.Trash size={16} aria-hidden="true" />)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-secondary text-muted">{t("field")}</span>
        {(["full", "half", "free"] as DiagramField[]).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={value.field === f}
            disabled={busy}
            onClick={() => onChange({ ...value, field: f })}
            className={`h-9 rounded-control px-3 text-secondary ${
              value.field === f ? "bg-surface font-semibold text-ink shadow-row" : "text-muted"
            }`}
          >
            {t(`fields.${f}`)}
          </button>
        ))}
        <Button
          size="sm"
          variant="tertiary"
          onClick={() => {
            clearMovement();
            onChange({ field: value.field, pieces: [], arrows: [] });
          }}
          disabled={busy || (value.pieces.length === 0 && value.arrows.length === 0)}
        >
          {t("clear")}
        </Button>
      </div>
      <p className="text-secondary text-muted" aria-live="polite">
        {hint}
      </p>
      <DrillBoard
        diagram={value}
        pieces={shown}
        trails={!animating}
        selected={busy ? null : selected}
        label={t("summary", { pieces: value.pieces.length, arrows: value.arrows.length })}
        className={`touch-none ${recording ? "outline-2 outline-danger" : "cursor-crosshair"}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        {start ? <circle cx={start.x * sx} cy={start.y} r={2} fill="var(--club-deep)" /> : null}
      </DrillBoard>

      {/* Movimiento: grabar por capas, con voz si se quiere, y reproducir. */}
      <section
        aria-label={t("movement")}
        className="flex flex-col gap-3 rounded-field border border-border p-3"
      >
        {recording ? (
          <div className="flex flex-wrap items-center gap-3" role="status">
            <span className="inline-flex items-center gap-2 font-medium text-danger">
              <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-danger" />
              {recording.phase === "starting"
                ? t("preparingMic")
                : t("recording", { time: clock(recording.t) })}
            </span>
            <Button
              size="sm"
              variant="danger-solid"
              icon={<Icon.Stop size={16} aria-hidden="true" />}
              disabled={recording.phase === "starting"}
              onClick={() => void stopRecording()}
            >
              {t("stop")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="secondary"
              icon={
                <Icon.Record size={16} weight="fill" className="text-danger" aria-hidden="true" />
              }
              disabled={pb.playing || value.pieces.length === 0}
              onClick={() => void startRecording()}
            >
              {value.animation ? t("recordMore") : t("record")}
            </Button>
            {voiceOk ? (
              <label className="inline-flex min-h-10 items-center gap-2 text-secondary text-ink">
                <input
                  type="checkbox"
                  className="size-5 accent-club"
                  checked={withVoice}
                  disabled={pb.playing}
                  onChange={(e) => setWithVoice(e.target.checked)}
                />
                <Icon.Microphone size={16} aria-hidden="true" />
                {t("withVoice")}
              </label>
            ) : null}
            {value.animation ? (
              <Button size="sm" variant="tertiary" disabled={pb.playing} onClick={clearMovement}>
                {t("clearAnimation")}
              </Button>
            ) : null}
          </div>
        )}
        <p className="text-secondary text-muted">
          {value.animation
            ? t("duration", { seconds: Math.round(value.animation.durationMs / 1000) })
            : t("recordIntro")}
        </p>
        {value.animation && !recording ? <PlaybackBar pb={pb} hasVoice={hasVoice} /> : null}
        {hasVoice && !recording ? (
          <div className="flex flex-wrap items-center gap-2 text-secondary text-ink">
            <Icon.Microphone size={16} aria-hidden="true" />
            {audio?.blob ? t("voicePending") : t("voiceRecorded")}
            <Button
              size="sm"
              variant="tertiary"
              disabled={pb.playing}
              onClick={() => onAudioChange?.(null)}
            >
              {t("removeVoice")}
            </Button>
          </div>
        ) : null}
        {notice ? (
          <p className="text-secondary text-warning" role="status">
            {notice}
          </p>
        ) : null}
      </section>

      {value.pieces.length + value.arrows.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <ul className="flex flex-wrap gap-1.5" aria-label={t("elements")}>
            {value.pieces.map((p, i) => (
              <li
                key={`p${i}`}
                className={`inline-flex items-center rounded-chip border ${
                  selected === i ? "border-club" : "border-border"
                }`}
              >
                <button
                  type="button"
                  aria-pressed={selected === i}
                  aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
                  aria-label={t("selectElement", { element: pieceName(p) })}
                  onClick={() => setSelected(i)}
                  onKeyDown={(e) => nudge(e, i)}
                  className="h-8 pl-2 pr-1 text-label text-ink"
                >
                  {pieceName(p)}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={t("removeElement", { element: pieceName(p) })}
                  onClick={() => removePiece(i)}
                  className="grid h-8 w-7 place-items-center text-muted hover:text-ink"
                >
                  <Icon.X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
            {value.arrows.map((a, i) => (
              <li key={`a${i}`}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onChange({ ...value, arrows: value.arrows.filter((_, j) => j !== i) })
                  }
                  className="inline-flex h-8 items-center gap-1 rounded-chip border border-border px-2 text-label text-ink"
                  aria-label={t("removeElement", { element: t(`tools.${a.kind}`) })}
                >
                  {t(`tools.${a.kind}`)}
                  <Icon.X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {value.pieces.length > 0 ? (
            <p className="text-label text-muted">{t("keyboardHint")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
