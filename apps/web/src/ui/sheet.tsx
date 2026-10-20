import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./button";
import { X } from "./icons";

/**
 * Panel para formularios cortos: inferior en Envolvente, diálogo centrado en Precisa (DESIGN.md 6 y 9.12).
 * `<dialog>` nativo: foco, ESC y fondo los pone el navegador.
 */
export function Sheet({
  open,
  title,
  description,
  onClose,
  closeLabel,
  footer,
  children,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  closeLabel: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="sheet-title"
      className={
        "mx-0 mt-auto mb-0 w-full max-w-none rounded-t-sheet bg-surface p-0 text-ink " +
        "precisa:m-auto precisa:max-w-lg precisa:rounded-sheet"
      }
    >
      {open ? (
        <div className="flex max-h-[90vh] flex-col">
          <div
            className="mx-auto mt-3 h-1 w-9 rounded-full bg-control precisa:hidden"
            aria-hidden="true"
          />
          <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id="sheet-title" className="text-title1">
                {title}
              </h2>
              {description ? <p className="text-secondary text-muted">{description}</p> : null}
            </div>
            <IconButton label={closeLabel} onClick={onClose}>
              <X size={22} aria-hidden="true" />
            </IconButton>
          </header>
          <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
          {footer ? (
            <footer className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 precisa:flex-row precisa:justify-end">
              {footer}
            </footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
