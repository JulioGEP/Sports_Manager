import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle, Warning } from "./icons";

type ToastKind = "success" | "error";
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}
type Push = (kind: ToastKind, text: string) => void;

const ToastContext = createContext<Push | null>(null);

/** Aviso tras una acción (DESIGN.md 9.13): píldora oscura abajo, 4 segundos, `role="status"`. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback<Push>((kind, text) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, kind, text }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4000);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-5">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="toast-in flex min-h-14 max-w-xl items-center gap-3 rounded-control bg-ink px-5 py-3 text-body text-white shadow-float"
          >
            {toast.kind === "success" ? (
              <CheckCircle size={22} aria-hidden="true" className="shrink-0 text-success" />
            ) : (
              <Warning size={22} aria-hidden="true" className="shrink-0 text-warning" />
            )}
            <span>{toast.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Push {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast fuera de ToastProvider");
  return push;
}
