import { useIsFetching } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigation } from "react-router";

/**
 * Hilo de progreso arriba (ADR 0060): solo si algo tarda más de 150 ms (una pantalla que se
 * descarga o datos que se refrescan), para que lo rápido no parpadee. La pantalla anterior sigue
 * viéndose y se puede usar mientras tanto.
 */
export function TopProgress() {
  const navigating = useNavigation().state !== "idle";
  // Solo lo que se ve en pantalla: la precarga de un enlace no enciende la barra.
  const fetching = useIsFetching({ predicate: (query) => query.getObserversCount() > 0 }) > 0;
  const busy = navigating || fetching;
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const handle = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(handle);
  }, [busy]);
  if (!visible) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5">
      <div className="top-progress h-full bg-club" />
    </div>
  );
}
