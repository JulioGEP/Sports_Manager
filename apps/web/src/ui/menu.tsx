import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";

/** Menú desplegable sencillo: clic fuera y ESC lo cierran. El disparador lleva `aria-label`. */
export function Menu({
  trigger,
  label,
  align = "end",
  children,
}: {
  trigger: ReactNode;
  label: string;
  align?: "start" | "end";
  children: ReactNode;
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
    <div className="relative" ref={root}>
      <button
        type="button"
        className="inline-flex h-(--h-control) items-center gap-2 rounded-control px-2 text-ink transition-colors hover:bg-raised"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className={`absolute top-full z-40 mt-2 min-w-56 overflow-hidden rounded-card border border-border bg-surface p-2 shadow-float ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

const itemClass =
  "flex w-full min-h-11 items-center gap-3 rounded-field px-3 py-2 text-left text-body text-ink no-underline transition-colors hover:bg-raised";

export function MenuItem({
  icon,
  children,
  onClick,
  to,
  tone = "default",
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  to?: string;
  tone?: "default" | "danger";
}) {
  const cls = `${itemClass} ${tone === "danger" ? "text-danger" : ""}`;
  if (to) {
    return (
      <Link role="menuitem" to={to} className={cls}>
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button type="button" role="menuitem" className={cls} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

export function MenuSection({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-1 text-label uppercase tracking-wide text-muted">{children}</div>
  );
}

export function MenuDivider() {
  return <div className="my-1 border-t border-line" aria-hidden="true" />;
}
