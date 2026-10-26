import type { ReactNode } from "react";

/** Un bloque de una pestaña que junta varias tarjetas de lo mismo, con su nombre encima. */
export function SettingsGroup({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-label={title} className="flex scroll-mt-20 flex-col gap-3">
      <h2 className="text-label font-medium uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}
