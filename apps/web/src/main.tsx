import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { prefetchClub } from "./lib/club";
import { loadLocale } from "./lib/intl";
import { initialLocale } from "./lib/locale";
import { queryClient } from "./lib/query-client";
import "./styles/app.css";

/**
 * Tras un deploy, una pestaña abierta desde antes pide pantallas que ya no existen (cada versión
 * lleva sus ficheros). Se recarga una vez para coger la versión nueva; si vuelve a fallar en menos
 * de un minuto, no se insiste y se ve el error.
 */
window.addEventListener("vite:preloadError", (event) => {
  const key = "sm.reloadedForUpdate";
  try {
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

/**
 * Antes de pintar (ADR 0060): si la página es de un club, su marca, la sesión, el club y las
 * pertenencias salen ya en un solo lote, a la vez que se descarga el diccionario del idioma. Cuando
 * React monta el espacio del club, lo que necesita está llegando o ya ha llegado.
 */
prefetchClub(queryClient, window.location.pathname);
await loadLocale(initialLocale());

const root = document.getElementById("root");
if (!root) throw new Error("Falta #root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
