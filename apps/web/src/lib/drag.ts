import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

/**
 * Arrastrar y soltar con eventos de puntero (ratón, dedo y lápiz), sin la API de arrastre de
 * HTML5, que en pantallas táctiles no existe. Pensado para la consola del partido (DESIGN.md 9.19):
 *
 * - Un toque corto sigue siendo un toque: el arrastre solo empieza al moverse más de `threshold`
 *   píxeles, y el clic que sigue a un arrastre se descarta con `consumeClick`.
 * - Los destinos se marcan con `data-drop="..."` y se localizan con `elementFromPoint`, así el
 *   fantasma que sigue al dedo no captura nada y el destino puede ser cualquier elemento.
 * - Quien arrastra pinta el fantasma con `drag.x` y `drag.y` y resalta `drag.over`.
 * - Escape, `pointercancel` (el navegador se queda el gesto para desplazar) o soltar fuera de un
 *   destino lo cancelan sin hacer nada.
 */
export interface DragState<T> {
  item: T;
  x: number;
  y: number;
  /** Destino bajo el puntero (`data-drop`), o nulo si no hay ninguno. */
  over: string | null;
}

export function useTileDrag<T>(onDrop: (item: T, target: string) => void, threshold = 8) {
  const [drag, setDrag] = useState<DragState<T> | null>(null);
  const pending = useRef<{ item: T; x: number; y: number } | null>(null);
  const active = useRef<DragState<T> | null>(null);
  const dragged = useRef(false);
  const frame = useRef(0);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  useEffect(() => {
    const targetAt = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]")?.dataset["drop"] ?? null;
    const paint = () => {
      frame.current = 0;
      if (active.current) setDrag({ ...active.current });
    };
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (p && !active.current) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < threshold) return;
        active.current = { item: p.item, x: e.clientX, y: e.clientY, over: null };
        dragged.current = true;
      }
      const a = active.current;
      if (!a) return;
      a.x = e.clientX;
      a.y = e.clientY;
      a.over = targetAt(e.clientX, e.clientY);
      if (!frame.current) frame.current = requestAnimationFrame(paint);
    };
    const finish = () => {
      pending.current = null;
      active.current = null;
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
      setDrag(null);
    };
    const up = (e: PointerEvent) => {
      const a = active.current;
      finish();
      if (!a) return;
      const target = targetAt(e.clientX, e.clientY);
      if (target) dropRef.current(a.item, target);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && active.current) finish();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("keydown", key);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [threshold]);

  /** Para el `onPointerDown` de cada pieza que se puede arrastrar. */
  const start = useCallback(
    (item: T) => (e: ReactPointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return;
      pending.current = { item, x: e.clientX, y: e.clientY };
      dragged.current = false;
    },
    [],
  );

  /** Verdadero si el clic que llega es el final de un arrastre: hay que ignorarlo. */
  const consumeClick = useCallback(() => {
    const was = dragged.current;
    dragged.current = false;
    return was;
  }, []);

  return { drag, start, consumeClick };
}
