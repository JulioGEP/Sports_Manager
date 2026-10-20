"use client";

import type { ReactNode } from "react";
import { useBranding } from "@/components/branding-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Card, initials } from "@/ui";

/** Pantallas de acceso: una tarjeta centrada con la marca del club del host o de la plataforma. */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const branding = useBranding();
  const name = branding?.name ?? "Sports Manager";
  return (
    <div className="auth">
      <div className="auth__box">
        <div className="auth__brand">
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="" className="topbar__logo" />
          ) : (
            <span className="brand-mark" aria-hidden="true">
              {initials(name)}
            </span>
          )}
          <strong>{name}</strong>
        </div>
        <Card title={title} description={description}>
          {children}
        </Card>
        <div className="auth__footer">
          {footer}
          <LanguageSwitcher hasSession={false} />
        </div>
      </div>
    </div>
  );
}
