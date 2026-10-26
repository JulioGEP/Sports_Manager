import {
  CheckoutSessionResponseSchema,
  MyStoreOrdersResponseSchema,
  personDisplayName,
  STORE_MAX_LINE_QUANTITY,
  STORE_PRODUCT_CATEGORIES,
  StoreCatalogResponseSchema,
  StoreOrderResponseSchema,
  type StoreBeneficiary,
  type StoreCatalogProduct,
  type StoreOrder,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { money } from "@/components/fees";
import { OrderStatusChip, PaymentStatusChip, ProductImage, pendingOf } from "@/components/store";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Input,
  PageHeader,
  Select,
  Sheet,
  StatusChip,
  Tabs,
  useToast,
} from "@/ui";

/**
 * La tienda para quien compra (ADR 0041): la familia de un menor, para él, o el deportista adulto,
 * para sí. Catálogo por categorías, ficha con las tallas, una cesta que separa para quién es cada
 * cosa (un pedido por persona) y los pedidos con su pago. Se paga como una cuota.
 */

type CartLine = { personId: string; productId: string; variantId: string; quantity: number };

const cartKey = (slug: string) => `sm.cart.${slug}`;

/** La cesta vive en la sesión del navegador: sobrevive a ir y volver, no a cerrar la pestaña. */
/**
 * Precio de un producto para una persona (ADR 0049): el de socio si el producto lo tiene y la
 * persona es socia o atleta con tarifa activa; si no, el de siempre.
 */
export function priceFor(
  product: { priceCents: number; memberPriceCents: number | null },
  beneficiary: StoreBeneficiary | null | undefined,
): number {
  return beneficiary?.memberPrice && product.memberPriceCents !== null
    ? product.memberPriceCents
    : product.priceCents;
}

function useCart(slug: string) {
  const [lines, setLines] = useState<CartLine[]>(() => {
    try {
      const raw = sessionStorage.getItem(cartKey(slug));
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(cartKey(slug), JSON.stringify(lines));
    } catch {
      // Sin almacenamiento, la cesta dura lo que dure la página.
    }
  }, [slug, lines]);
  const add = useCallback((line: CartLine) => {
    setLines((current) => {
      const same = current.find(
        (l) => l.personId === line.personId && l.variantId === line.variantId,
      );
      return same
        ? current.map((l) =>
            l === same
              ? { ...l, quantity: Math.min(STORE_MAX_LINE_QUANTITY, l.quantity + line.quantity) }
              : l,
          )
        : [...current, line];
    });
  }, []);
  return { lines, setLines, add };
}

type Tab = "catalog" | "orders";

export function ShopPage() {
  const t = useT("shop");
  const { slug } = useReadyClub();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "orders" ? "orders" : "catalog";
  const checkout = params.get("checkout");
  const productParam = params.get("product");
  const cart = useCart(slug);
  const [cartOpen, setCartOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(productParam);
  const catalog = useQuery({
    queryKey: ["org", slug, "store", "catalog"],
    queryFn: () => apiFetch("/api/org/store/catalog", { schema: StoreCatalogResponseSchema }),
  });
  const mine = useQuery({
    queryKey: ["org", slug, "store", "mine"],
    queryFn: () => apiFetch("/api/org/store/mine", { schema: MyStoreOrdersResponseSchema }),
  });
  const products = catalog.data?.products ?? [];
  const beneficiaries = catalog.data?.beneficiaries ?? [];

  // Lo que ya no está a la venta (o se agotó la opción) sale de la cesta al cargar el catálogo.
  const variants = useMemo(() => {
    const map = new Map<string, { product: StoreCatalogProduct; inStock: boolean }>();
    for (const p of products)
      for (const v of p.variants) map.set(v.id, { product: p, inStock: v.inStock });
    return map;
  }, [products]);
  const { setLines } = cart;
  useEffect(() => {
    if (!catalog.data) return;
    setLines((current) => current.filter((l) => variants.has(l.variantId)));
  }, [catalog.data, variants, setLines]);

  const units = cart.lines.reduce((sum, l) => sum + l.quantity, 0);
  const openOrders = (mine.data?.orders ?? []).filter(
    (o) => o.status === "pending" || o.status === "ready",
  ).length;
  const product = products.find((p) => p.id === selected) ?? null;

  function setTab(next: Tab) {
    setParams(next === "catalog" ? {} : { tab: next }, { replace: true });
  }
  function dismissCheckout() {
    const sp = new URLSearchParams(params);
    sp.delete("checkout");
    setParams(sp, { replace: true });
  }
  function closeProduct() {
    setSelected(null);
    if (productParam) {
      const sp = new URLSearchParams(params);
      sp.delete("product");
      setParams(sp, { replace: true });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            variant={units > 0 ? "primary" : "secondary"}
            icon={<Icon.ShoppingBag size={18} aria-hidden="true" />}
            onClick={() => setCartOpen(true)}
          >
            {t("cart.open", { count: units })}
          </Button>
        }
      />
      {checkout === "success" ? (
        <Alert kind="success">
          <span className="flex flex-wrap items-center justify-between gap-2">
            {t("checkoutSuccess")}
            <Button size="sm" variant="tertiary" onClick={dismissCheckout}>
              {t("dismiss")}
            </Button>
          </span>
        </Alert>
      ) : null}
      {checkout === "cancel" ? (
        <Alert kind="info">
          <span className="flex flex-wrap items-center justify-between gap-2">
            {t("checkoutCancel")}
            <Button size="sm" variant="tertiary" onClick={dismissCheckout}>
              {t("dismiss")}
            </Button>
          </span>
        </Alert>
      ) : null}
      <Tabs<Tab>
        label={t("title")}
        selected={tab}
        onChange={setTab}
        items={[
          { key: "catalog", label: t("tabs.catalog") },
          {
            key: "orders",
            label: openOrders > 0 ? t("tabs.ordersCount", { count: openOrders }) : t("tabs.orders"),
          },
        ]}
      />
      {catalog.isError ? <Alert kind="error">{t("loadError")}</Alert> : null}
      {tab === "catalog" ? (
        <Catalog
          loading={catalog.isPending}
          products={products}
          beneficiaries={beneficiaries}
          onOpen={setSelected}
        />
      ) : (
        <MyOrders />
      )}
      {product ? (
        <ProductBuySheet
          key={product.id}
          product={product}
          beneficiaries={beneficiaries.filter((b) => product.beneficiaryIds.includes(b.personId))}
          onClose={closeProduct}
          onAdd={(line) => {
            cart.add(line);
            closeProduct();
          }}
        />
      ) : null}
      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lines={cart.lines}
        setLines={cart.setLines}
        variants={variants}
        beneficiaries={beneficiaries}
        onOrdered={() => {
          setCartOpen(false);
          setTab("orders");
        }}
      />
    </div>
  );
}

function Catalog({
  loading,
  products,
  beneficiaries,
  onOpen,
}: {
  loading: boolean;
  products: StoreCatalogProduct[];
  beneficiaries: StoreBeneficiary[];
  onOpen: (id: string) => void;
}) {
  const t = useT("shop");
  const cats = useT("storeCategories");
  const c = useT("common");
  const { day } = useDates();
  if (loading)
    return <div className="h-64 animate-pulse rounded-card bg-raised" aria-label={c("loading")} />;
  if (beneficiaries.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Icon.Storefront weight="duotone" />}
          title={t("noBeneficiaries")}
          description={t("noBeneficiariesHint")}
        />
      </Card>
    );
  }
  if (products.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Icon.Storefront weight="duotone" />}
          title={t("empty")}
          description={t("emptyHint")}
        />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {STORE_PRODUCT_CATEGORIES.filter((k) => products.some((p) => p.category === k)).map((k) => (
        <section key={k} className="flex flex-col gap-3" aria-label={cats(k)}>
          <h2 className="text-title2 text-ink">{cats(k)}</h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products
              .filter((p) => p.category === k)
              .map((p) => {
                const available = p.variants.some((v) => v.inStock);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(p.id)}
                      className="flex h-full w-full flex-col gap-2 rounded-card bg-surface p-3 text-left shadow-card transition-colors hover:bg-raised precisa:border precisa:border-border"
                    >
                      <ProductImage url={p.imageUrl} category={p.category} size="fill" />
                      <span className="line-clamp-2 text-body font-medium text-ink">{p.name}</span>
                      <span className="mt-auto flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-body text-ink">{money(p.priceCents)}</span>
                        {available ? null : <StatusChip kind="neutral">{t("soldOut")}</StatusChip>}
                      </span>
                      {p.memberPriceCents !== null ? (
                        <span className="text-label text-club-text">
                          {t("memberPrice", { price: money(p.memberPriceCents) })}
                        </span>
                      ) : null}
                      {p.availableUntil ? (
                        <span className="text-label text-muted">
                          {t("until", { date: day(p.availableUntil) })}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Ficha de compra: la foto, la descripción, la talla, cuántos y para quién. */
function ProductBuySheet({
  product,
  beneficiaries,
  onClose,
  onAdd,
}: {
  product: StoreCatalogProduct;
  beneficiaries: StoreBeneficiary[];
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const t = useT("shop.product");
  const c = useT("common");
  const { day } = useDates();
  const options = product.variants;
  const single = options.length === 1 && options[0]!.label === null;
  const [variantId, setVariantId] = useState<string>(() =>
    single && options[0]!.inStock ? options[0]!.id : "",
  );
  const [quantity, setQuantity] = useState(1);
  const [personId, setPersonId] = useState(beneficiaries[0]?.personId ?? "");
  const chosen = options.find((v) => v.id === variantId) ?? null;
  const available = options.some((v) => v.inStock);
  const maxQty = chosen?.lowStock ?? STORE_MAX_LINE_QUANTITY;
  const unit = priceFor(
    product,
    beneficiaries.find((b) => b.personId === personId),
  );

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={product.name}
      description={money(unit)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action="add"
            disabled={!chosen || !chosen.inStock || !personId}
            onClick={() => onAdd({ personId, productId: product.id, variantId, quantity })}
          >
            {t("add", { total: money(unit * quantity) })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="mx-auto w-full max-w-72">
          <ProductImage url={product.imageUrl} category={product.category} size="fill" />
        </div>
        {product.description ? (
          <p className="whitespace-pre-line text-body text-ink">{product.description}</p>
        ) : null}
        {product.availableUntil ? (
          <p className="text-secondary text-muted">
            {t("until", { date: day(product.availableUntil) })}
          </p>
        ) : null}
        {!available ? <Alert kind="info">{t("soldOut")}</Alert> : null}
        {!single ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="pb-1 text-secondary font-medium text-ink">{t("option")}</legend>
            <div className="flex flex-wrap gap-2">
              {options.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={variantId === v.id}
                  disabled={!v.inStock}
                  onClick={() => {
                    setVariantId(v.id);
                    setQuantity(1);
                  }}
                  className={`inline-flex min-h-11 min-w-12 items-center justify-center rounded-control border px-3 text-body font-medium transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-50 ${
                    variantId === v.id
                      ? "border-club bg-club-soft text-club-soft-text"
                      : "border-control bg-surface text-ink hover:bg-raised"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {chosen?.lowStock ? (
              <p className="text-secondary text-warning">
                {t("lowStock", { count: chosen.lowStock })}
              </p>
            ) : null}
          </fieldset>
        ) : chosen?.lowStock ? (
          <p className="text-secondary text-warning">{t("lowStock", { count: chosen.lowStock })}</p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <span className="text-secondary font-medium text-ink">{t("quantity")}</span>
          <div className="flex items-center gap-2">
            <IconButton
              label={t("less")}
              disabled={quantity <= 1}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="border border-control"
            >
              <Icon.Minus size={18} aria-hidden="true" />
            </IconButton>
            <span className="min-w-8 text-center font-mono text-body text-ink" aria-live="polite">
              {quantity}
            </span>
            <IconButton
              label={t("more")}
              disabled={quantity >= maxQty}
              onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
              className="border border-control"
            >
              <Icon.Plus size={18} aria-hidden="true" />
            </IconButton>
          </div>
        </div>
        {beneficiaries.length > 1 ? (
          <Field label={t("for")} hint={t("forHint")}>
            {(id) => (
              <Select id={id} value={personId} onChange={(e) => setPersonId(e.target.value)}>
                {beneficiaries.map((b) => (
                  <option key={b.personId} value={b.personId}>
                    {b.kind === "self" ? t("forSelf") : personDisplayName(b)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : beneficiaries[0] ? (
          <p className="text-secondary text-muted">
            {beneficiaries[0].kind === "self"
              ? t("forSelfLine")
              : t("forLine", { name: personDisplayName(beneficiaries[0]) })}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

/** La cesta: un grupo por persona (cada grupo es un pedido), con su nota y el total. */
function CartSheet({
  open,
  onClose,
  lines,
  setLines,
  variants,
  beneficiaries,
  onOrdered,
}: {
  open: boolean;
  onClose: () => void;
  lines: CartLine[];
  setLines: (update: (current: CartLine[]) => CartLine[]) => void;
  variants: Map<string, { product: StoreCatalogProduct; inStock: boolean }>;
  beneficiaries: StoreBeneficiary[];
  onOrdered: () => void;
}) {
  const t = useT("shop.cart");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = beneficiaries
    .map((b) => ({ beneficiary: b, lines: lines.filter((l) => l.personId === b.personId) }))
    .filter((g) => g.lines.length > 0);
  const lineTotal = (l: CartLine) => {
    const product = variants.get(l.variantId)?.product;
    if (!product) return 0;
    return (
      priceFor(
        product,
        beneficiaries.find((b) => b.personId === l.personId),
      ) * l.quantity
    );
  };
  const total = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const who = (b: StoreBeneficiary) => (b.kind === "self" ? t("forSelf") : personDisplayName(b));

  function setQty(line: CartLine, quantity: number) {
    setLines((current) =>
      quantity <= 0
        ? current.filter(
            (l) => l !== line && !(l.personId === line.personId && l.variantId === line.variantId),
          )
        : current.map((l) =>
            l.personId === line.personId && l.variantId === line.variantId
              ? { ...l, quantity: Math.min(STORE_MAX_LINE_QUANTITY, quantity) }
              : l,
          ),
    );
  }

  async function order() {
    setConfirming(false);
    setBusy(true);
    setError(null);
    const codes: string[] = [];
    try {
      for (const g of groups) {
        const res = await apiFetch("/api/org/store/mine/orders", {
          method: "POST",
          body: {
            personId: g.beneficiary.personId,
            items: g.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
            note: notes[g.beneficiary.personId]?.trim() || null,
          },
          schema: StoreOrderResponseSchema,
        });
        codes.push(res.order.code);
        // Cada pedido hecho sale de la cesta; si el siguiente falla, lo hecho no se repite.
        setLines((current) => current.filter((l) => l.personId !== g.beneficiary.personId));
      }
      toast("success", t("ordered", { codes: codes.join(", "), count: codes.length }));
      setNotes({});
      onOrdered();
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
      void client.invalidateQueries({ queryKey: ["org", slug, "store"] });
      void client.invalidateQueries({ queryKey: ["org", slug, "fees"] });
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        closeLabel={c("close")}
        title={t("title")}
        description={groups.length > 0 ? t("description") : undefined}
        footer={
          groups.length > 0 ? (
            <>
              <Button variant="secondary" onClick={onClose}>
                {t("keepShopping")}
              </Button>
              <Button action="pay" loading={busy} onClick={() => setConfirming(true)}>
                {t("submit", { total: money(total) })}
              </Button>
            </>
          ) : null
        }
      >
        {groups.length === 0 ? (
          <EmptyState
            icon={<Icon.ShoppingBag weight="duotone" />}
            title={t("empty")}
            description={t("emptyHint")}
          />
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((g) => {
              const subtotal = g.lines.reduce((sum, l) => sum + lineTotal(l), 0);
              return (
                <section key={g.beneficiary.personId} className="flex flex-col gap-3">
                  <h3 className="flex items-center justify-between gap-2 text-body font-semibold text-ink">
                    <span>{t("groupFor", { name: who(g.beneficiary) })}</span>
                    <span className="font-mono">{money(subtotal)}</span>
                  </h3>
                  <ul className="flex flex-col divide-y divide-line rounded-field border border-border">
                    {g.lines.map((l) => {
                      const found = variants.get(l.variantId);
                      if (!found) return null;
                      const option = found.product.variants.find((v) => v.id === l.variantId);
                      return (
                        <li key={l.variantId} className="flex items-center gap-3 px-3 py-2">
                          <ProductImage
                            url={found.product.imageUrl}
                            category={found.product.category}
                            size="sm"
                          />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-body text-ink">
                              {found.product.name}
                            </span>
                            <span className="text-label text-muted">
                              {[option?.label, money(priceFor(found.product, g.beneficiary))]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          <span className="flex items-center gap-1">
                            <IconButton label={t("less")} onClick={() => setQty(l, l.quantity - 1)}>
                              <Icon.Minus size={16} aria-hidden="true" />
                            </IconButton>
                            <span className="min-w-6 text-center font-mono text-body">
                              {l.quantity}
                            </span>
                            <IconButton
                              label={t("more")}
                              disabled={
                                option?.lowStock !== null &&
                                option?.lowStock !== undefined &&
                                l.quantity >= option.lowStock
                              }
                              onClick={() => setQty(l, l.quantity + 1)}
                            >
                              <Icon.Plus size={16} aria-hidden="true" />
                            </IconButton>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <Field label={t("note")} hint={t("noteHint")}>
                    {(id) => (
                      <Input
                        id={id}
                        maxLength={300}
                        value={notes[g.beneficiary.personId] ?? ""}
                        onChange={(e) =>
                          setNotes({ ...notes, [g.beneficiary.personId]: e.target.value })
                        }
                      />
                    )}
                  </Field>
                </section>
              );
            })}
            <p className="text-secondary text-muted">{t("paymentHint")}</p>
            {error ? <Alert kind="error">{error}</Alert> : null}
          </div>
        )}
      </Sheet>
      <ConfirmDialog
        open={confirming}
        title={t("confirmTitle")}
        body={t("confirmBody", {
          total: money(total),
          count: groups.length,
          names: groups.map((g) => who(g.beneficiary)).join(", "),
        })}
        confirmLabel={t("confirm")}
        confirmAction="pay"
        cancelLabel={c("cancel")}
        onConfirm={() => void order()}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

/** Los pedidos propios: en qué punto están, qué falta por pagar y, si se puede, pagar ya. */
function MyOrders() {
  const t = useT("shop.orders");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { day } = useDates();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [paying, setPaying] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<StoreOrder | null>(null);
  const mine = useQuery({
    queryKey: ["org", slug, "store", "mine"],
    queryFn: () => apiFetch("/api/org/store/mine", { schema: MyStoreOrdersResponseSchema }),
  });
  const orders = mine.data?.orders ?? [];
  const unpaid = orders.filter((o) => o.status !== "cancelled" && pendingOf(o) > 0);

  async function pay(order: StoreOrder) {
    if (!order.payment.chargeId) return;
    setPaying(order.id);
    try {
      const res = await apiFetch(`/api/org/fees/charges/${order.payment.chargeId}/checkout`, {
        method: "POST",
        body: { returnPath: "/store?tab=orders" },
        schema: CheckoutSessionResponseSchema,
      });
      window.location.assign(res.url);
    } catch (err) {
      toast("error", errors(errorKey(err)));
      setPaying(null);
    }
  }

  async function cancel(order: StoreOrder) {
    setCancelling(null);
    try {
      await apiFetch(`/api/org/store/mine/orders/${order.id}/cancel`, {
        method: "POST",
        schema: StoreOrderResponseSchema,
      });
      toast("success", t("cancelled", { code: order.code }));
      void client.invalidateQueries({ queryKey: ["org", slug, "store"] });
      void client.invalidateQueries({ queryKey: ["org", slug, "fees"] });
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  if (mine.isPending)
    return <div className="h-40 animate-pulse rounded-card bg-raised" aria-label={c("loading")} />;
  if (mine.isError) return <Alert kind="error">{t("loadError")}</Alert>;
  if (orders.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Icon.Receipt weight="duotone" />}
          title={t("empty")}
          description={t("emptyHint")}
        />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {mine.data?.provider === "manual" && unpaid.length > 0 ? (
        <Alert kind="info">
          {t("manualHint")} <Link to={paths.fees}>{t("seeFees")}</Link>
        </Alert>
      ) : null}
      <ul className="flex flex-col gap-3">
        {orders.map((o) => {
          const pending = pendingOf(o);
          return (
            <li key={o.id}>
              <Card padded={false}>
                <div className="flex flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-body font-semibold text-ink">{o.code}</span>
                        <OrderStatusChip status={o.status} />
                        {o.status !== "cancelled" ? (
                          <PaymentStatusChip status={o.payment.status} />
                        ) : null}
                      </span>
                      <span className="text-secondary text-muted">
                        {t("line", {
                          name: personDisplayName(o.person),
                          date: day(o.createdAt.slice(0, 10)),
                        })}
                      </span>
                    </div>
                    <span className="flex flex-col items-end">
                      <span className="font-mono text-title2 text-ink">{money(o.totalCents)}</span>
                      {pending > 0 && pending < o.totalCents ? (
                        <span className="text-label text-muted">
                          {t("pending", { amount: money(pending) })}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {o.items.map((i) => (
                      <li key={i.id} className="flex items-center gap-3">
                        <ProductImage url={i.imageUrl} category="other" size="sm" />
                        <span className="min-w-0 flex-1 text-body text-ink">
                          {i.quantity} × {i.productName}
                          {i.variantLabel ? (
                            <span className="text-muted"> · {i.variantLabel}</span>
                          ) : null}
                        </span>
                        <span className="font-mono text-secondary text-muted">
                          {money(i.unitPriceCents * i.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {o.status === "ready" ? <Alert kind="info">{t("readyHint")}</Alert> : null}
                  {o.note ? (
                    <p className="text-secondary text-muted">{t("note", { note: o.note })}</p>
                  ) : null}
                  {o.payment.payableOnline ||
                  (o.status === "pending" && o.payment.paidCents === 0) ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      {o.status === "pending" && o.payment.paidCents === 0 ? (
                        <Button
                          variant="secondary"
                          action="suspend"
                          onClick={() => setCancelling(o)}
                        >
                          {t("cancel")}
                        </Button>
                      ) : null}
                      {o.payment.payableOnline ? (
                        <Button action="pay" loading={paying === o.id} onClick={() => void pay(o)}>
                          {t("pay", { amount: money(pending) })}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={cancelling !== null}
        title={t("confirmCancelTitle")}
        body={t("confirmCancelBody", { code: cancelling?.code ?? "" })}
        confirmLabel={t("cancel")}
        confirmAction="suspend"
        cancelLabel={c("cancel")}
        onConfirm={() => cancelling && void cancel(cancelling)}
        onCancel={() => setCancelling(null)}
      />
    </div>
  );
}

/**
 * La tienda fijada en la página de la familia y del deportista adulto: tres productos y el enlace.
 * Solo si esta persona puede comprar y el club vende algo para los suyos.
 */
export function StoreSpotlight() {
  const t = useT("shop.spotlight");
  const { org, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const canShop = org.actor.kind === "member" && org.actor.canShop === true;
  const catalog = useQuery({
    queryKey: ["org", slug, "store", "catalog"],
    queryFn: () => apiFetch("/api/org/store/catalog", { schema: StoreCatalogResponseSchema }),
    enabled: canShop,
  });
  if (!canShop || !catalog.data || catalog.data.products.length === 0) return null;
  const featured = [...catalog.data.products]
    .sort((a, b) => Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)))
    .slice(0, 3);
  const names = catalog.data.beneficiaries.map((b) => b.firstName);
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Icon.Storefront size={22} weight="duotone" aria-hidden="true" />
          {t("title")}
        </span>
      }
      description={
        catalog.data.beneficiaries.some((b) => b.kind === "self")
          ? t("descriptionSelf", { count: catalog.data.products.length })
          : t("description", { count: catalog.data.products.length, names: names.join(", ") })
      }
      actions={
        <ButtonLink action="open" to={paths.store} variant="secondary" size="sm">
          {t("open")}
        </ButtonLink>
      }
    >
      <ul className="grid grid-cols-3 gap-3">
        {featured.map((p) => (
          <li key={p.id}>
            <Link
              to={`${paths.store}?product=${p.id}`}
              className="flex flex-col gap-1.5 rounded-field text-ink no-underline hover:opacity-90"
            >
              <ProductImage url={p.imageUrl} category={p.category} size="fill" />
              <span className="line-clamp-2 text-secondary font-medium">{p.name}</span>
              <span className="font-mono text-label text-muted">{money(p.priceCents)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
