"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Menú desplegable sencillo: clic fuera y ESC lo cierran. */
export function Menu({
  trigger,
  children,
  label,
}: {
  trigger: ReactNode;
  children: ReactNode;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={root}>
      <button
        type="button"
        className="menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open ? (
        <div className="menu__panel" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
