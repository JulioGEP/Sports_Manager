import { ActionIcon, type ActionKind } from "@sportsmanager/design";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import { useT } from "@/lib/intl";
import { DESKTOP_QUERY } from "@/lib/theme";
import { useMediaQuery } from "@/lib/media";
import { Button, ButtonLink } from "./button";
import { CaretRight, DotsThreeVertical } from "./icons";
import { Menu, MenuItem } from "./menu";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | undefined;
  /** Cifra: Geist Mono y alineada a la derecha. */
  numeric?: boolean | undefined;
}

export interface MobileRow {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
}

/**
 * Acción de fila (DESIGN.md 9.8): un verbo con su icono del catálogo. En escritorio es un icono
 * silencioso a la derecha de la fila; en móvil, un icono si es la única o un menú "⋯" si hay varias.
 */
export interface RowAction {
  key: string;
  /** El verbo: nombre accesible, tooltip y texto del menú. */
  label: string;
  action?: ActionKind | undefined;
  icon?: ReactNode;
  /** `danger` en rojo; `primary` en color del club (la acción que la fila está esperando). */
  tone?: "default" | "danger" | "primary" | undefined;
  onClick?: (() => void) | undefined;
  to?: string | undefined;
  loading?: boolean | undefined;
}

const interactive = "a, button, input, select, textarea, label, [role='menu'], [role='dialog']";

/**
 * Filas de la primera pintura (ADR 0060). Una lista de 450 personas se pinta en dos tiempos: lo que
 * cabe en pantalla y algo más, al momento, y el resto justo después, sin bloquear la página.
 */
const FIRST_ROWS = 60;

/**
 * Lista de datos con dos formas (DESIGN.md 9.7 y 9.8): tabla de filas de 52 px en escritorio,
 * filas cápsula de 64 px en móvil. La fila es el objeto: si tiene `href`, se abre tocándola en
 * cualquier punto (el enlace del título sigue ahí para el teclado y el lector de pantalla) y lo dice
 * con un chevron. Las acciones (`rowActions`) no compiten con el contenido: iconos silenciosos.
 */
export function DataList<T>({
  columns,
  rows,
  getKey,
  mobileRow,
  href,
  rowActions,
  actions,
  empty,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
  mobileRow: (row: T) => MobileRow;
  /** Adónde lleva la fila al tocarla. */
  href?: ((row: T) => string | undefined) | undefined;
  rowActions?: ((row: T) => RowAction[]) | undefined;
  /** Acciones a medida con verbo visible, solo cuando la fila necesita más que iconos (partidos). */
  actions?: ((row: T) => ReactNode) | undefined;
  empty: ReactNode;
  caption: string;
}) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const navigate = useNavigate();
  const c = useT("common");
  // Al escribir en un buscador, el campo responde primero y la lista se repinta después.
  const deferred = useDeferredValue(rows);
  const [limit, setLimit] = useState(FIRST_ROWS);
  useEffect(() => {
    if (deferred.length <= limit) return;
    const handle = setTimeout(() => startTransition(() => setLimit(Infinity)), 0);
    return () => clearTimeout(handle);
  }, [deferred.length, limit]);
  const shown = deferred.length > limit ? deferred.slice(0, limit) : deferred;
  if (rows.length === 0) return <>{empty}</>;

  function open(e: MouseEvent, to: string) {
    if ((e.target as HTMLElement).closest(interactive)) return;
    if (window.getSelection()?.toString()) return;
    if (e.metaKey || e.ctrlKey) {
      window.open(to, "_blank", "noopener");
      return;
    }
    void navigate(to);
  }
  const hasActionColumn = Boolean(rowActions || actions || href);

  if (!desktop) {
    return (
      <ul className="flex flex-col gap-2.5" aria-label={caption}>
        {shown.map((row) => {
          const item = mobileRow(row);
          const to = href?.(row);
          const acts = rowActions?.(row).filter(Boolean) ?? [];
          const custom = actions?.(row);
          /** En línea va la acción que la fila espera (tono `primary`) o la única que hay; el resto, en "⋯". */
          const inline =
            acts.find((a) => a.tone === "primary") ?? (acts.length === 1 ? acts[0] : undefined);
          const menu = acts.filter((a) => a !== inline);
          return (
            <li
              key={getKey(row)}
              onClick={to ? (e) => open(e, to) : undefined}
              data-prefetch={to}
              className={`relative flex min-h-16 flex-wrap items-center gap-3 rounded-row bg-surface px-4 py-2.5 shadow-row transition-colors precisa:border precisa:border-border ${
                to ? "cursor-pointer active:bg-page" : ""
              }`}
            >
              {item.leading}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-medium text-ink">{item.title}</span>
                {item.subtitle ? (
                  <span className="truncate text-secondary text-muted">{item.subtitle}</span>
                ) : null}
              </div>
              {item.trailing}
              {inline ? <RowActionButton a={inline} /> : null}
              {menu.length > 0 ? (
                <Menu
                  label={c("moreActions")}
                  trigger={<DotsThreeVertical size={22} aria-hidden="true" />}
                >
                  {menu.map((a) => (
                    <MenuItem
                      key={a.key}
                      icon={
                        a.action ? (
                          <ActionIcon action={a.action} size={20} />
                        ) : (
                          (a.icon ?? undefined)
                        )
                      }
                      tone={a.tone === "danger" ? "danger" : "default"}
                      {...(a.to ? { to: a.to } : {})}
                      {...(a.onClick ? { onClick: a.onClick } : {})}
                    >
                      {a.label}
                    </MenuItem>
                  ))}
                </Menu>
              ) : null}
              {to ? (
                <CaretRight size={16} aria-hidden="true" className="shrink-0 text-muted" />
              ) : null}
              {custom ? (
                <div className="flex basis-full flex-wrap justify-end gap-2 pt-1">{custom}</div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="h-11 border-b border-line text-left text-label uppercase tracking-wide text-muted">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-3 font-medium first:pl-5 last:pr-5 ${col.align === "right" || col.numeric ? "text-right" : ""}`}
              >
                {col.header}
              </th>
            ))}
            {hasActionColumn ? <th scope="col" className="px-3 pr-4" /> : null}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => {
            const to = href?.(row);
            const acts = rowActions?.(row).filter(Boolean) ?? [];
            const custom = actions?.(row);
            return (
              <tr
                key={getKey(row)}
                onClick={to ? (e) => open(e, to) : undefined}
                data-prefetch={to}
                className={`group h-13 border-b border-line transition-colors last:border-b-0 hover:bg-page ${
                  to ? "cursor-pointer" : ""
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 align-middle first:pl-5 last:pr-5 ${
                      col.numeric
                        ? "text-right font-mono tabular"
                        : col.align === "right"
                          ? "text-right"
                          : ""
                    }`}
                  >
                    {col.cell(row)}
                  </td>
                ))}
                {hasActionColumn ? (
                  <td className="w-px px-3 py-1 pr-4 align-middle whitespace-nowrap">
                    <div className="flex items-center justify-end gap-0.5">
                      {acts.map((a) => (
                        <RowActionButton key={a.key} a={a} />
                      ))}
                      {custom}
                      {to && acts.length === 0 && !custom ? (
                        <CaretRight
                          size={16}
                          aria-hidden="true"
                          className="mr-1 text-muted transition-colors group-hover:text-ink"
                        />
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RowActionButton({ a }: { a: RowAction }) {
  const variant =
    a.tone === "danger" ? "ghost-danger" : a.tone === "primary" ? "tertiary" : "ghost";
  if (a.to) {
    return (
      <ButtonLink iconOnly action={a.action} icon={a.icon} to={a.to} variant={variant} size="sm">
        {a.label}
      </ButtonLink>
    );
  }
  return (
    <Button
      iconOnly
      action={a.action}
      icon={a.icon}
      variant={variant}
      size="sm"
      loading={a.loading}
      onClick={a.onClick}
    >
      {a.label}
    </Button>
  );
}
