import {
  personDisplayName,
  StoreOrderResponseSchema,
  type StoreOrderStatus,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import { money, PaymentSheet } from "@/components/fees";
import { OrderStatusChip, PaymentStatusChip, ProductImage, pendingOf } from "@/components/store";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import { Alert, Button, Card, ConfirmDialog, Definitions, PageHeader, useToast } from "@/ui";

/**
 * Ficha de un pedido de la tienda (ADR 0041) para quien la gestiona: qué lleva, para quién, en qué
 * punto está y su cobro. Se prepara, se entrega, se cobra a mano o se anula (devuelve el stock).
 */
export function StoreOrderPage() {
  const t = useT("storeOrder");
  const os = useT("storeOrderStatus");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { day } = useDates();
  const { id = "" } = useParams();
  const { org, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const client = useQueryClient();
  const canWrite = org.actor.permissions.includes("org.store.write");
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState<StoreOrderStatus | null>(null);
  const query = useQuery({
    queryKey: ["org", slug, "store", "order", id],
    queryFn: () => apiFetch(`/api/org/store/orders/${id}`, { schema: StoreOrderResponseSchema }),
    enabled: org.actor.permissions.includes("org.store.read"),
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug, "store"] });

  if (!org.actor.permissions.includes("org.store.read"))
    return <Alert kind="error">{errors("forbidden")}</Alert>;
  if (query.isError) {
    const missing = query.error instanceof ApiClientError && query.error.status === 404;
    return <Alert kind="error">{missing ? t("notFound") : errors(errorKey(query.error))}</Alert>;
  }
  if (!query.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-48 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  const order = query.data.order;
  const pending = pendingOf(order);
  const open = order.status === "pending" || order.status === "ready";

  async function move(next: StoreOrderStatus) {
    setBusy(next);
    setCancelling(false);
    try {
      const res = await apiFetch(`/api/org/store/orders/${order.id}`, {
        method: "PATCH",
        body: { status: next },
      });
      const refund = (res as { refundCents?: number }).refundCents ?? 0;
      toast(
        "success",
        next === "cancelled" && refund > 0
          ? t("cancelledRefund", { amount: money(refund) })
          : t("moved", { status: os(next).toLowerCase() }),
      );
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(null);
    }
  }

  const next: StoreOrderStatus | null =
    order.status === "pending" ? "ready" : order.status === "ready" ? "delivered" : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={paths.store}
        backLabel={t("back")}
        eyebrow={`${day(order.createdAt.slice(0, 10))} · ${
          order.channel === "counter" ? t("channel.counter") : t("channel.app")
        }`}
        title={
          <>
            {t("title", { code: order.code })}
            <OrderStatusChip status={order.status} />
          </>
        }
        description={t("for", { name: personDisplayName(order.person) })}
        actions={
          canWrite ? (
            <>
              {open ? (
                <Button variant="secondary" action="suspend" onClick={() => setCancelling(true)}>
                  {t("cancel")}
                </Button>
              ) : null}
              {order.payment.chargeId && pending > 0 && order.status !== "cancelled" ? (
                <Button
                  variant={next ? "secondary" : "primary"}
                  action="pay"
                  onClick={() => setPaying(true)}
                >
                  {t("recordPayment")}
                </Button>
              ) : null}
              {next ? (
                <Button
                  action={next === "ready" ? "finish" : "approve"}
                  loading={busy === next}
                  onClick={() => void move(next)}
                >
                  {next === "ready" ? t("markReady") : t("markDelivered")}
                </Button>
              ) : null}
              {order.status === "delivered" ? (
                <Button variant="secondary" action="restore" onClick={() => void move("ready")}>
                  {t("undoDelivered")}
                </Button>
              ) : null}
            </>
          ) : null
        }
      />
      {order.status === "cancelled" && order.payment.paidCents > 0 ? (
        <Alert kind="warning">{t("refundDue", { amount: money(order.payment.paidCents) })}</Alert>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title={t("items")} padded={false}>
          <ul className="flex flex-col divide-y divide-line">
            {order.items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                <ProductImage url={i.imageUrl} category="other" size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body font-medium text-ink">{i.productName}</span>
                  <span className="text-label text-muted">
                    {[i.variantLabel, t("unit", { price: money(i.unitPriceCents) })]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="font-mono text-body text-muted">× {i.quantity}</span>
                <span className="w-24 text-right font-mono text-body text-ink">
                  {money(i.unitPriceCents * i.quantity)}
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between px-5 py-4">
              <span className="text-body font-semibold text-ink">{t("total")}</span>
              <span className="font-mono text-title2 text-ink">{money(order.totalCents)}</span>
            </li>
          </ul>
        </Card>
        <div className="flex flex-col gap-5">
          <Card title={t("payment")}>
            <Definitions
              items={[
                {
                  term: t("paymentStatus"),
                  detail: <PaymentStatusChip status={order.payment.status} />,
                },
                { term: t("paid"), detail: money(order.payment.paidCents) },
                ...(pending > 0 ? [{ term: t("pending"), detail: money(pending) }] : []),
                ...(order.payment.dueOn && pending > 0
                  ? [{ term: t("dueOn"), detail: day(order.payment.dueOn) }]
                  : []),
              ]}
            />
            {order.payment.chargeId ? (
              <p className="mt-4 text-secondary text-muted">{t("chargeHint")}</p>
            ) : null}
          </Card>
          <Card title={t("details")}>
            <Definitions
              items={[
                { term: t("person"), detail: personDisplayName(order.person) },
                ...(order.placedBy ? [{ term: t("placedBy"), detail: order.placedBy.name }] : []),
                ...(order.note ? [{ term: t("note"), detail: order.note }] : []),
              ]}
            />
          </Card>
        </div>
      </div>
      {canWrite && order.payment.chargeId ? (
        <PaymentSheet
          charge={
            paying
              ? {
                  id: order.payment.chargeId,
                  person: order.person,
                  concept: t("title", { code: order.code }),
                  amountCents: order.totalCents,
                  paidCents: order.payment.paidCents,
                }
              : null
          }
          path={`/api/org/store/orders/${order.id}/payments`}
          onClose={() => setPaying(false)}
          onSaved={() => void reload()}
        />
      ) : null}
      <ConfirmDialog
        open={cancelling}
        title={t("confirmCancelTitle", { code: order.code })}
        body={
          order.payment.paidCents > 0
            ? t("confirmCancelPaid", { amount: money(order.payment.paidCents) })
            : t("confirmCancelBody")
        }
        confirmLabel={t("cancel")}
        confirmAction="suspend"
        cancelLabel={c("cancel")}
        onConfirm={() => void move("cancelled")}
        onCancel={() => setCancelling(false)}
      />
    </div>
  );
}
