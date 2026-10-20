"use client";

import type { OrganizationBranding } from "@sportsmanager/shared";
import { createContext, useContext, type ReactNode } from "react";

const BrandingContext = createContext<OrganizationBranding | null>(null);

/** Marca del club del host, resuelta en el servidor y compartida con los componentes de cliente. */
export function BrandingProvider({
  value,
  children,
}: {
  value: OrganizationBranding | null;
  children: ReactNode;
}) {
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): OrganizationBranding | null {
  return useContext(BrandingContext);
}
