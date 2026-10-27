import type { ActionKind } from "@sportsmanager/design";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";

export interface TourStep {
  /** Selector de lo que se ilumina. Sin él, o si no está en pantalla, el paso va centrado. */
  target?: string | undefined;
  title: ReactNode;
  body: ReactNode;
}

type Box = { top: number; left: number; width: number; height: number };

/** Aire alrededor de lo iluminado y entre ello y la tarjeta; margen con el borde de la pantalla. */
const PAD = 6;
const GAP = 12;
const EDGE = 16;
const CARD_WIDTH = 360;
/** Lo iluminado no sube de aquí al desplazar: en móvil, arriba va la cabecera fija. */
const TOP_CLEAR = 80;
/** Alto de la tarjeta mientras no se ha podido medir. */
const CARD_HEIGHT = 240;

/** El primer elemento del selector que se ve: el escritorio y el móvil pintan navegaciones distintas. */
function findTarget(selector: string | undefined): HTMLElement | null {
  if (!selector) return null;
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** Fijo en pantalla (la barra lateral, la inferior, la cabecera): desplazar no lo mueve. */
function pinned(el: HTMLElement): boolean {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const position = getComputedStyle(node).position;
    if (position === "fixed" || position === "sticky") return true;
  }
  return false;
}

/**
 * Trae lo iluminado a la vista: lo más centrado posible dejando sitio debajo para la tarjeta. Si
 * es tan alto que no cabe con ella, al centro, y la tarjeta se coloca donde pueda.
 */
function bringIntoView(el: HTMLElement, cardHeight: number) {
  if (pinned(el)) return;
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const height = r.height + PAD * 2;
  const centered = (vh - height) / 2;
  const lowest = vh - EDGE - cardHeight - GAP - height;
  const top = lowest >= TOP_CLEAR ? Math.min(centered, lowest) : centered;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollBy({ top: r.top - PAD - top, behavior: still ? "instant" : "smooth" });
}

function sameBox(a: Box | null, b: Box | null) {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.top === b.top &&
      a.left === b.left &&
      a.width === b.width &&
      a.height === b.height)
  );
}

/**
 * Dónde va la tarjeta: debajo de lo iluminado si cabe, si no encima, si no a su derecha (la
 * navegación lateral) y, si nada cabe, abajo del todo. Siempre dentro de la pantalla.
 */
function placeCard(spot: Box | null, cardHeight: number): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_WIDTH, vw - EDGE * 2);
  const clampLeft = (x: number) => Math.max(EDGE, Math.min(x, vw - width - EDGE));
  const clampTop = (y: number) => Math.max(EDGE, Math.min(y, vh - cardHeight - EDGE));
  if (!spot) return { top: clampTop((vh - cardHeight) / 2), left: clampLeft((vw - width) / 2) };
  const bottom = spot.top + spot.height;
  const right = spot.left + spot.width;
  if (bottom + GAP + cardHeight <= vh - EDGE) {
    return { top: bottom + GAP, left: clampLeft(spot.left) };
  }
  if (spot.top - GAP - cardHeight >= EDGE) {
    return { top: spot.top - GAP - cardHeight, left: clampLeft(spot.left) };
  }
  if (right + GAP + width <= vw - EDGE) {
    return { top: clampTop(spot.top), left: right + GAP };
  }
  return { top: vh - cardHeight - EDGE, left: clampLeft((vw - width) / 2) };
}

/**
 * Recorrido guiado (ADR 0059): sombrea la pantalla y deja a la luz, paso a paso, lo que explica,
 * con una tarjeta al lado que dice qué es y para qué sirve. `<dialog>` modal nativo: el foco, ESC
 * y el resto de la página inerte los pone el navegador. ESC, "Saltar" o "Cerrar" lo cierran; el
 * botón principal del último paso es `onFinish`. Las flechas del teclado pasan de paso.
 */
export function Tour({
  open,
  steps,
  onClose,
  onFinish,
  labels,
  finishAction,
}: {
  open: boolean;
  steps: TourStep[];
  onClose: () => void;
  onFinish: () => void;
  labels: {
    progress: (step: number, total: number) => string;
    next: string;
    back: string;
    skip: string;
    /** En el último paso, en lugar de "Saltar". */
    close: string;
    finish: string;
  };
  finishAction?: ActionKind | undefined;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<Box | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setIndex(0);
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>("[data-primary]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Cada paso: lo iluminado se trae a la vista y el foco va al botón principal.
  useLayoutEffect(() => {
    if (!open) return;
    const el = findTarget(step?.target);
    if (el) bringIntoView(el, cardRef.current?.offsetHeight || CARD_HEIGHT);
    if (!cardRef.current?.contains(document.activeElement)) {
      cardRef.current?.querySelector<HTMLButtonElement>("[data-primary]")?.focus();
    }
  }, [open, index, step?.target]);

  // La pantalla se mueve (desplazamiento, datos que llegan, otro tamaño): el foco la sigue.
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const follow = () => {
      const el = findTarget(step?.target);
      const r = el?.getBoundingClientRect();
      const next = r
        ? {
            top: Math.round(r.top) - PAD,
            left: Math.round(r.left) - PAD,
            width: Math.round(r.width) + PAD * 2,
            height: Math.round(r.height) + PAD * 2,
          }
        : null;
      setSpot((prev) => (sameBox(prev, next) ? prev : next));
      setCardHeight(cardRef.current?.offsetHeight ?? 0);
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [open, step?.target]);

  const place = placeCard(spot, cardHeight);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // El navegador puede cerrarlo por su cuenta (un segundo ESC seguido): también es saltarlo.
      onClose={() => {
        if (open) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" && !last) setIndex((i) => i + 1);
        if (e.key === "ArrowLeft" && index > 0) setIndex((i) => i - 1);
      }}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="tour fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden bg-transparent p-0 text-ink"
    >
      {open && step ? (
        <>
          {spot ? (
            <div
              aria-hidden="true"
              className="tour-spotlight pointer-events-none absolute rounded-card"
              style={spot}
            />
          ) : (
            <div aria-hidden="true" className="tour-shade absolute inset-0" />
          )}
          <div
            ref={cardRef}
            className="absolute flex w-[min(22.5rem,calc(100vw-2rem))] flex-col gap-3 rounded-card bg-surface p-5 shadow-float precisa:border precisa:border-border"
            style={place}
          >
            <p className="text-label uppercase tracking-wide text-club-text">
              {labels.progress(index + 1, steps.length)}
            </p>
            <h2 id={titleId} className="text-title2 text-ink">
              {step.title}
            </h2>
            <p id={bodyId} className="text-body text-muted">
              {step.body}
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <Button variant="tertiary" size="sm" onClick={onClose}>
                {last ? labels.close : labels.skip}
              </Button>
              <div className="flex flex-wrap gap-2">
                {index > 0 ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    action="back"
                    onClick={() => setIndex((i) => i - 1)}
                  >
                    {labels.back}
                  </Button>
                ) : null}
                <Button
                  data-primary
                  size="sm"
                  action={last ? finishAction : "open"}
                  onClick={() => (last ? onFinish() : setIndex((i) => i + 1))}
                >
                  {last ? labels.finish : labels.next}
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </dialog>
  );
}
