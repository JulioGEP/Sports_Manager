"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";

interface DrawerProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  closeLabel: string;
  footer?: ReactNode;
  children: ReactNode;
}

/** Panel lateral para formularios cortos: no saca a la persona de la página. ESC y fondo cierran. */
export function Drawer({
  open,
  title,
  description,
  onClose,
  closeLabel,
  footer,
  children,
}: DrawerProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>("input, select, textarea, button");
    first?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="drawer" role="presentation">
      <div className="drawer__backdrop" onClick={onClose} />
      <div
        className="drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        ref={panel}
      >
        <header className="drawer__header">
          <div>
            <h2 id="drawer-title" className="drawer__title">
              {title}
            </h2>
            {description ? <p className="drawer__description">{description}</p> : null}
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm drawer__close"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <Icon.X size={18} />
          </button>
        </header>
        <div className="drawer__body">{children}</div>
        {footer ? <footer className="drawer__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
