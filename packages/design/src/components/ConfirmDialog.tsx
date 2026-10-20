import { useEffect, useRef } from "react";
import { Button } from "./Button";

/**
 * Confirmación de acciones delicadas. Ver DESIGN.md, sección 9.12.
 * Se usa SIEMPRE para: dar de baja, borrar, cobrar, cambiar cuotas y enviar un comunicado a todas las familias.
 * No se usa para marcar asistencia ni para confirmar un partido.
 * En móvil (Envolvente) es un panel inferior; en gestión (Precisa), un diálogo centrado.
 *
 * Reglas de texto:
 * - title: la pregunta con el nombre. "¿Dar de baja a Nil Soler?"
 * - body: qué pasará y si se puede deshacer.
 * - confirmLabel: repite el verbo. "Dar de baja", nunca "Aceptar".
 */

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancelar",
  tone = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      className={
        "mx-0 mt-auto mb-0 w-full max-w-none rounded-t-sheet bg-surface p-5 pb-6 text-ink backdrop:bg-ink/50 " +
        "precisa:m-auto precisa:max-w-md precisa:rounded-sheet"
      }
    >
      <div className="flex flex-col gap-4">
        <div
          className="mx-auto h-1 w-9 rounded-full bg-control precisa:hidden"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-2">
          <h2 id="confirm-title" className="text-title1">
            {title}
          </h2>
          <p id="confirm-body" className="text-body">
            {body}
          </p>
        </div>
        <div className="flex flex-col gap-2 precisa:flex-row-reverse">
          <Button
            variant={tone === "danger" ? "danger-solid" : "primary"}
            cta
            onClick={onConfirm}
            className="precisa:h-11 precisa:w-auto"
          >
            {confirmLabel}
          </Button>
          <Button
            variant="secondary"
            cta
            onClick={onCancel}
            className="precisa:h-11 precisa:w-auto"
          >
            {cancelLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
