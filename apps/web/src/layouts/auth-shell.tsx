"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useBranding } from "@/components/branding-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Card, initials } from "@/ui";

/**
 * Pantallas de acceso: una tarjeta centrada. Con `platform`, la marca es la de la plataforma
 * (entrada del negocio, ADR 0026); si no, la del club del host.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
  platform = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  platform?: boolean;
}) {
  const t = useTranslations("platform.nav");
  const branding = useBranding();
  const clubName = branding?.name ?? "Sports Manager";
  return (
    <div className={`auth${platform ? " auth--platform" : ""}`}>
      <div className="auth__box">
        <div className="auth__brand">
          {platform ? (
            <>
              <span className="brand-mark" aria-hidden="true">
                SM
              </span>
              <strong>Sports Manager</strong>
              <span className="muted small">{t("subtitle")}</span>
            </>
          ) : (
            <>
              {branding?.logoUrl ? (
                <img src={branding.logoUrl} alt="" className="topbar__logo" />
              ) : (
                <span className="brand-mark" aria-hidden="true">
                  {initials(clubName)}
                </span>
              )}
              <strong>{clubName}</strong>
            </>
          )}
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
