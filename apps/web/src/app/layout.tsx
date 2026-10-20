import "@sportsmanager/shared/design/tokens.css";
import "./globals.css";
import { brandCssVariables } from "@sportsmanager/shared";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { BrandingProvider } from "@/components/branding-provider";
import { getBranding } from "@/lib/branding";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  return {
    title: branding ? `${branding.name} · Sports Manager` : "Sports Manager",
    ...(branding?.logoUrl ? { icons: { icon: branding.logoUrl } } : {}),
  };
}

/**
 * Layout raíz: idioma y marca del club del host. Los colores del club sobrescriben los tokens
 * de marca en `<html>`; el resto de tokens no cambia por club (packages/shared/design).
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, branding] = await Promise.all([getLocale(), getBranding()]);
  const style = branding ? (brandCssVariables(branding) as CSSProperties) : undefined;
  return (
    <html lang={locale} style={style}>
      <body>
        <NextIntlClientProvider>
          <BrandingProvider value={branding}>{children}</BrandingProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
