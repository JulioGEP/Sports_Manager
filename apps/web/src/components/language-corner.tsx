"use client";

import { useSession } from "@/lib/session";
import { LanguageSwitcher } from "./language-switcher";

/** Esquina fija con el selector de idioma, visible en todas las páginas. */
export function LanguageCorner() {
  const session = useSession();
  return (
    <div className="lang-corner">
      <LanguageSwitcher hasSession={session.kind === "authenticated"} />
    </div>
  );
}
