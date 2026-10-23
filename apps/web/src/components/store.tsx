import type {
  StoreOrder,
  StoreOrderStatus,
  StorePaymentStatus,
  StoreProductCategory,
} from "@sportsmanager/shared";
import { useT } from "@/lib/intl";
import { Icon, StatusChip, type StatusKind } from "@/ui";

/** Piezas de la tienda (ADR 0041) compartidas por la gestión, la compra y la ficha del pedido. */

/** Recibido pide acción (prepararlo); listo espera a la familia; entregado está hecho. */
export const orderStatusKind: Record<StoreOrderStatus, StatusKind> = {
  pending: "warning",
  ready: "info",
  delivered: "success",
  cancelled: "neutral",
};

export const paymentStatusKind: Record<StorePaymentStatus, StatusKind> = {
  pending: "info",
  overdue: "warning",
  paid: "success",
  cancelled: "neutral",
  free: "neutral",
};

export function OrderStatusChip({ status }: { status: StoreOrderStatus }) {
  const t = useT("storeOrderStatus");
  return <StatusChip kind={orderStatusKind[status]}>{t(status)}</StatusChip>;
}

export function PaymentStatusChip({ status }: { status: StorePaymentStatus }) {
  const t = useT("storePaymentStatus");
  return <StatusChip kind={paymentStatusKind[status]}>{t(status)}</StatusChip>;
}

export const categoryIcon: Record<StoreProductCategory, typeof Icon.Tag> = {
  apparel: Icon.TShirt,
  equipment: Icon.Backpack,
  event: Icon.Ticket,
  trip: Icon.Bus,
  other: Icon.Tag,
};

const imageSizes = {
  sm: "size-10 rounded-field [&_svg]:size-5",
  md: "size-16 rounded-field [&_svg]:size-7",
  fill: "aspect-square w-full rounded-card [&_svg]:size-12",
};

/** Foto del producto o, sin ella, el icono de su categoría sobre superficie elevada. */
export function ProductImage({
  url,
  category,
  size = "md",
}: {
  url: string | null;
  category: StoreProductCategory;
  size?: keyof typeof imageSizes;
}) {
  const Glyph = categoryIcon[category];
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden bg-raised text-club-text ${imageSizes[size]}`}
    >
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <Glyph weight="duotone" aria-hidden="true" />
      )}
    </span>
  );
}

/** "2 × Camiseta (S) · 1 × Cena": lo que lleva un pedido en una línea. */
export function itemsSummary(items: StoreOrder["items"]): string {
  return items
    .map((i) => `${i.quantity} × ${i.productName}${i.variantLabel ? ` (${i.variantLabel})` : ""}`)
    .join(" · ");
}

/** Lo que falta por pagar de un pedido abierto. */
export function pendingOf(order: StoreOrder): number {
  return order.payment.status === "pending" || order.payment.status === "overdue"
    ? Math.max(0, order.totalCents - order.payment.paidCents)
    : 0;
}
