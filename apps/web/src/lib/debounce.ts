import { useEffect, useState } from "react";

/** El valor tras un rato sin cambiar: una búsqueda contra la API no pide a cada tecla. */
export function useDebouncedValue<T>(value: T, ms = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(handle);
  }, [value, ms]);
  return settled;
}
