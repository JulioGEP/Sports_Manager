import { useEffect, type ReactNode } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/lib/intl";
import { useMediaQuery } from "@/lib/media";
import { applyProductColors, DESKTOP_QUERY, setShape } from "@/lib/theme";
import { Card, Crest } from "@/ui";

/**
 * Pantallas de acceso: tarjeta centrada. Con un club, su escudo y su color; fuera de un club
 * (negocio, acceso general), la marca del producto. DESIGN.md, secciones 2 y 7.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
  club,
  platform = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  club?: { name: string; logoUrl: string | null } | null | undefined;
  /** Entrada del negocio: subtítulo de administración en vez del lema del producto. */
  platform?: boolean | undefined;
}) {
  const nav = useT("platform.nav");
  const product = useT("auth.product");
  const desktop = useMediaQuery(DESKTOP_QUERY);
  useEffect(() => {
    setShape(desktop ? "precisa" : "envolvente");
  }, [desktop]);
  useEffect(() => {
    if (!club) applyProductColors();
  }, [club]);

  return (
    <div className="grid min-h-screen place-items-center px-5 py-8">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          {club ? (
            <>
              <Crest name={club.name} logoUrl={club.logoUrl} size="lg" />
              <strong className="text-title2 text-ink">{club.name}</strong>
            </>
          ) : (
            <>
              <span
                aria-hidden="true"
                className="grid size-14 place-items-center rounded-full bg-brand font-semibold text-white"
              >
                SM
              </span>
              <strong className="text-title2 text-ink">Sports Manager</strong>
              <span className="text-secondary text-muted">
                {platform ? nav("subtitle") : product("tagline")}
              </span>
            </>
          )}
        </div>
        <Card title={title} description={description}>
          {children}
        </Card>
        <div className="flex flex-col items-center gap-3">
          {footer}
          <LanguageSwitcher hasSession={false} compact />
        </div>
      </div>
    </div>
  );
}
