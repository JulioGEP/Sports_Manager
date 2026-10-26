import {
  personDisplayName,
  SectionsResponseSchema,
  STORE_IMAGE_MAX_BYTES,
  STORE_IMAGE_MAX_SIDE_PX,
  STORE_LOW_STOCK,
  STORE_ORDER_STATUSES,
  STORE_PRODUCT_CATEGORIES,
  StoreOrderResponseSchema,
  StoreOrdersResponseSchema,
  StorePeopleResponseSchema,
  StoreProductCreateSchema,
  StoreProductResponseSchema,
  StoreProductsResponseSchema,
  StoreProductUpdateSchema,
  TeamsResponseSchema,
  centsToAmount,
  type StoreOrder,
  type StoreOrderStatus,
  type StoreProduct,
  type StoreProductCategory,
  type StoreProductVisibility,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { money } from "@/components/fees";
import { OrderStatusChip, PaymentStatusChip, ProductImage, itemsSummary } from "@/components/store";
import { apiFetch, errorKey, uploadFile } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { shrinkImage } from "@/lib/images";
import { useT } from "@/lib/intl";
import { downloadXlsx } from "@/lib/xlsx";
import {
  Alert,
  Button,
  DataList,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Input,
  PageHeader,
  Select,
  Sheet,
  Stat,
  StatusChip,
  Tabs,
  useToast,
  type RowAction,
} from "@/ui";
import { ShopPage } from "./shop";

/**
 * Tienda del club (ADR 0041). Quien la gestiona ve los pedidos y los productos con su stock;
 * la familia de un menor o el deportista adulto ve el catálogo y compra.
 */
export function StorePage() {
  const { org } = useReadyClub();
  return org.actor.permissions.includes("org.store.read") ? <StoreAdmin /> : <ShopPage />;
}

type AdminTab = "orders" | "products";

function StoreAdmin() {
  const t = useT("store");
  const { org, slug } = useReadyClub();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const canWrite = org.actor.permissions.includes("org.store.write");
  const tab: AdminTab = params.get("tab") === "products" ? "products" : "orders";
  // Abrir desde la paleta de mandos (`?counter=1`, `?new=1`) funciona también ya dentro de la tienda.
  const counter = params.get("counter") === "1";
  const creating = params.get("new") === "1";
  function setFlag(name: "counter" | "new", on: boolean) {
    const sp = new URLSearchParams(params);
    if (on) sp.set(name, "1");
    else sp.delete(name);
    if (on && name === "new") sp.set("tab", "products");
    setParams(sp, { replace: !on });
  }
  const setCounter = (on: boolean) => setFlag("counter", on);
  const setCreating = (on: boolean) => setFlag("new", on);
  const client = useQueryClient();
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug, "store"] });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          canWrite ? (
            tab === "orders" ? (
              <Button action="add" onClick={() => setCounter(true)}>
                {t("counter.action")}
              </Button>
            ) : (
              <Button action="add" onClick={() => setCreating(true)}>
                {t("products.new")}
              </Button>
            )
          ) : null
        }
      />
      <Tabs<AdminTab>
        label={t("title")}
        selected={tab}
        onChange={(key) => setParams(key === "orders" ? {} : { tab: key }, { replace: true })}
        items={[
          { key: "orders", label: t("tabs.orders") },
          { key: "products", label: t("tabs.products") },
        ]}
      />
      {tab === "orders" ? (
        <OrdersTab canWrite={canWrite} />
      ) : (
        <ProductsTab canWrite={canWrite} onCreate={() => setCreating(true)} />
      )}
      {canWrite && creating ? (
        <ProductSheet
          product={null}
          onClose={() => setCreating(false)}
          onSaved={() => void reload()}
        />
      ) : null}
      {canWrite && counter ? (
        <CounterOrderSheet
          onClose={() => setCounter(false)}
          onCreated={(order) => {
            void reload();
            void navigate(clubPaths(slug).storeOrder(order.id));
          }}
        />
      ) : null}
    </div>
  );
}

// --- Pedidos ---

function OrdersTab({ canWrite }: { canWrite: boolean }) {
  const t = useT("store.orders");
  const os = useT("storeOrderStatus");
  const ps = useT("storePaymentStatus");
  const errors = useT("errors");
  const toast = useToast();
  const { day } = useDates();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [params, setParams] = useSearchParams();
  const statusParam = params.get("status");
  const status = (STORE_ORDER_STATUSES as readonly string[]).includes(statusParam ?? "")
    ? (statusParam as StoreOrderStatus)
    : null;
  const [search, setSearch] = useState("");
  const orders = useQuery({
    queryKey: ["org", slug, "store", "orders", status],
    queryFn: () =>
      apiFetch(`/api/org/store/orders${status ? `?status=${status}` : ""}`, {
        schema: StoreOrdersResponseSchema,
      }),
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug, "store"] });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = orders.data?.orders ?? [];
    if (!q) return list;
    return list.filter((o) =>
      [o.code, personDisplayName(o.person), itemsSummary(o.items), o.note ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [orders.data, search]);

  function setStatus(next: string) {
    const sp = new URLSearchParams(params);
    if (next) sp.set("status", next);
    else sp.delete("status");
    setParams(sp, { replace: true });
  }

  async function move(order: StoreOrder, next: StoreOrderStatus) {
    try {
      await apiFetch(`/api/org/store/orders/${order.id}`, {
        method: "PATCH",
        body: { status: next },
      });
      toast("success", t("moved", { code: order.code, status: os(next).toLowerCase() }));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  /** Tres hojas: los pedidos, cada línea y lo que hay que preparar por producto y talla. */
  function download() {
    const list = rows;
    const open = list.filter((o) => o.status === "pending" || o.status === "ready");
    const toPrepare = new Map<string, { product: string; option: string; units: number }>();
    for (const o of open) {
      for (const i of o.items) {
        const key = `${i.productName}\u0000${i.variantLabel ?? ""}`;
        const entry = toPrepare.get(key) ?? {
          product: i.productName,
          option: i.variantLabel ?? "",
          units: 0,
        };
        entry.units += i.quantity;
        toPrepare.set(key, entry);
      }
    }
    downloadXlsx(t("export.file"), [
      {
        name: t("export.orders"),
        rows: [
          [
            t("table.code"),
            t("table.date"),
            t("table.person"),
            t("table.status"),
            t("table.payment"),
            t("table.total"),
            t("table.paid"),
            t("table.note"),
          ],
          ...list.map((o) => [
            o.code,
            o.createdAt.slice(0, 10),
            personDisplayName(o.person),
            os(o.status),
            ps(o.payment.status),
            o.totalCents / 100,
            o.payment.paidCents / 100,
            o.note ?? "",
          ]),
        ],
      },
      {
        name: t("export.lines"),
        rows: [
          [
            t("table.code"),
            t("table.person"),
            t("table.product"),
            t("table.option"),
            t("table.quantity"),
            t("table.unitPrice"),
            t("table.status"),
          ],
          ...list.flatMap((o) =>
            o.items.map((i) => [
              o.code,
              personDisplayName(o.person),
              i.productName,
              i.variantLabel ?? "",
              i.quantity,
              i.unitPriceCents / 100,
              os(o.status),
            ]),
          ),
        ],
      },
      {
        name: t("export.toPrepare"),
        rows: [
          [t("table.product"), t("table.option"), t("table.quantity")],
          ...[...toPrepare.values()]
            .sort((a, b) => a.product.localeCompare(b.product) || a.option.localeCompare(b.option))
            .map((e) => [e.product, e.option, e.units]),
        ],
      },
    ]);
  }

  const totals = orders.data?.totals;

  return (
    <div className="flex flex-col gap-5">
      {totals ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            icon={<Icon.Package weight="duotone" />}
            value={totals.toPrepare}
            label={t("stats.toPrepare")}
          />
          <Stat
            icon={<Icon.ShoppingBag weight="duotone" />}
            value={totals.ready}
            label={t("stats.ready")}
          />
          <Stat
            icon={<Icon.Coins weight="duotone" />}
            value={money(totals.unpaidCents)}
            label={t("stats.unpaid", { count: totals.unpaidCount })}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label={t("search")}>
            {(id) => (
              <Input
                id={id}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
              />
            )}
          </Field>
        </div>
        <div className="sm:w-56">
          <Field label={t("status")}>
            {(id) => (
              <Select id={id} value={status ?? ""} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{t("allStatuses")}</option>
                {STORE_ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {os(s)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Button
          variant="secondary"
          icon={<Icon.DownloadSimple size={18} aria-hidden="true" />}
          disabled={rows.length === 0}
          onClick={download}
        >
          {t("export.action")}
        </Button>
      </div>
      {orders.isError ? <Alert kind="error">{t("loadError")}</Alert> : null}
      <DataList<StoreOrder>
        caption={t("caption")}
        columns={[
          {
            key: "code",
            header: t("table.code"),
            cell: (o) => (
              <span className="flex flex-col">
                <Link
                  to={paths.storeOrder(o.id)}
                  className="whitespace-nowrap font-mono font-medium text-ink"
                >
                  {o.code}
                </Link>
                <span className="text-label text-muted">{day(o.createdAt.slice(0, 10))}</span>
              </span>
            ),
          },
          {
            key: "person",
            header: t("table.person"),
            cell: (o) => (
              <span className="flex flex-col">
                <span className="font-medium text-ink">{personDisplayName(o.person)}</span>
                <span className="text-label text-muted">
                  {o.channel === "counter" ? t("channel.counter") : t("channel.app")}
                </span>
              </span>
            ),
          },
          {
            key: "items",
            header: t("table.items"),
            cell: (o) => <span className="line-clamp-2">{itemsSummary(o.items)}</span>,
          },
          {
            key: "total",
            header: t("table.total"),
            align: "right",
            numeric: true,
            cell: (o) => <span className="whitespace-nowrap">{money(o.totalCents)}</span>,
          },
          {
            key: "status",
            header: t("table.status"),
            cell: (o) => <OrderStatusChip status={o.status} />,
          },
          {
            key: "payment",
            header: t("table.payment"),
            cell: (o) => <PaymentStatusChip status={o.payment.status} />,
          },
        ]}
        rows={rows}
        getKey={(o) => o.id}
        href={(o) => paths.storeOrder(o.id)}
        mobileRow={(o) => ({
          title: (
            <Link to={paths.storeOrder(o.id)} className="text-ink">
              {o.code} · {personDisplayName(o.person)}
            </Link>
          ),
          subtitle: itemsSummary(o.items),
          trailing: (
            <span className="flex flex-col items-end gap-1">
              <span className="font-mono text-body text-ink">{money(o.totalCents)}</span>
              <OrderStatusChip status={o.status} />
            </span>
          ),
        })}
        rowActions={
          canWrite
            ? (o): RowAction[] =>
                o.status === "pending"
                  ? [
                      {
                        key: "ready",
                        label: t("markReady"),
                        action: "finish",
                        tone: "primary",
                        onClick: () => void move(o, "ready"),
                      },
                    ]
                  : o.status === "ready"
                    ? [
                        {
                          key: "delivered",
                          label: t("markDelivered"),
                          action: "approve",
                          tone: "primary",
                          onClick: () => void move(o, "delivered"),
                        },
                      ]
                    : []
            : undefined
        }
        empty={
          <EmptyState
            icon={<Icon.Receipt weight="duotone" />}
            title={status || search ? t("emptyFiltered") : t("empty")}
            description={status || search ? undefined : t("emptyHint")}
          />
        }
      />
    </div>
  );
}

// --- Productos ---

/** Unidades en stock, o "sin límite"; y qué opciones están agotadas o quedan pocas. */
function useStockSummary() {
  const t = useT("store.products.stock");
  return (p: StoreProduct) => {
    const limited = p.variants.filter((v) => v.stock !== null);
    const units = limited.reduce((sum, v) => sum + (v.stock ?? 0), 0);
    const out = limited.filter((v) => v.stock === 0);
    const low = limited.filter((v) => (v.stock ?? 0) > 0 && (v.stock ?? 0) <= STORE_LOW_STOCK);
    const name = (v: StoreProduct["variants"][number]) => v.label ?? t("single");
    return {
      main: limited.length === 0 ? t("unlimited") : t("units", { count: units }),
      out: out.length > 0 ? t("out", { options: out.map(name).join(", ") }) : null,
      low:
        low.length > 0
          ? t("low", { options: low.map((v) => `${name(v)} (${v.stock})`).join(", ") })
          : null,
      sold: p.variants.reduce((sum, v) => sum + v.sold, 0),
    };
  };
}

function ProductsTab({ canWrite, onCreate }: { canWrite: boolean; onCreate: () => void }) {
  const t = useT("store.products");
  const cats = useT("storeCategories");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const [editing, setEditing] = useState<StoreProduct | null>(null);
  const stock = useStockSummary();
  const products = useQuery({
    queryKey: ["org", slug, "store", "products"],
    queryFn: () => apiFetch("/api/org/store/products", { schema: StoreProductsResponseSchema }),
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug, "store"] });

  async function setStatus(product: StoreProduct, status: StoreProduct["status"]) {
    try {
      await apiFetch(`/api/org/store/products/${product.id}`, {
        method: "PATCH",
        body: { status },
        schema: StoreProductResponseSchema,
      });
      toast("success", t(`statusChanged.${status}`, { name: product.name }));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  const audience = (p: StoreProduct) =>
    p.team ? p.team.name : p.section ? p.section.name : t("audience.club");

  return (
    <div className="flex flex-col gap-4">
      {products.isError ? <Alert kind="error">{t("loadError")}</Alert> : null}
      <DataList<StoreProduct>
        caption={t("caption")}
        columns={[
          {
            key: "name",
            header: t("table.product"),
            cell: (p) => (
              <span className="flex items-center gap-3">
                <ProductImage url={p.imageUrl} category={p.category} size="sm" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium text-ink">{p.name}</span>
                  <span className="text-label text-muted">{cats(p.category)}</span>
                </span>
              </span>
            ),
          },
          {
            key: "price",
            header: t("table.price"),
            align: "right",
            numeric: true,
            cell: (p) => <span className="whitespace-nowrap">{money(p.priceCents)}</span>,
          },
          {
            key: "stock",
            header: t("table.stock"),
            cell: (p) => {
              const s = stock(p);
              return (
                <span className="flex flex-col">
                  <span>{s.main}</span>
                  {s.out ? <span className="text-label text-danger">{s.out}</span> : null}
                  {s.low ? <span className="text-label text-warning">{s.low}</span> : null}
                </span>
              );
            },
          },
          {
            key: "sold",
            header: t("table.sold"),
            align: "right",
            numeric: true,
            cell: (p) => stock(p).sold,
          },
          {
            key: "audience",
            header: t("table.audience"),
            cell: (p) => (
              <span className="flex flex-col gap-1">
                <span>{audience(p)}</span>
                {p.visibility === "public" ? (
                  <span className="text-label text-muted">{t("audience.public")}</span>
                ) : null}
              </span>
            ),
          },
          {
            key: "status",
            header: t("table.status"),
            cell: (p) => (
              <StatusChip
                kind={p.status === "active" ? "success" : p.status === "draft" ? "info" : "neutral"}
              >
                {t(`status.${p.status}`)}
              </StatusChip>
            ),
          },
        ]}
        rows={products.data?.products ?? []}
        getKey={(p) => p.id}
        mobileRow={(p) => {
          const s = stock(p);
          return {
            leading: <ProductImage url={p.imageUrl} category={p.category} size="sm" />,
            title: p.name,
            subtitle: [money(p.priceCents), s.out ?? s.low ?? s.main].join(" · "),
            trailing: (
              <StatusChip
                kind={p.status === "active" ? "success" : p.status === "draft" ? "info" : "neutral"}
              >
                {t(`status.${p.status}`)}
              </StatusChip>
            ),
          };
        }}
        rowActions={
          canWrite
            ? (p): RowAction[] => [
                { key: "edit", label: t("edit"), action: "edit", onClick: () => setEditing(p) },
                p.status === "draft"
                  ? {
                      key: "publish",
                      label: t("publish"),
                      action: "activate",
                      tone: "primary",
                      onClick: () => void setStatus(p, "active"),
                    }
                  : p.status === "active"
                    ? {
                        key: "archive",
                        label: t("archive"),
                        action: "archive",
                        tone: "danger",
                        onClick: () => void setStatus(p, "archived"),
                      }
                    : {
                        key: "restore",
                        label: t("restore"),
                        action: "restore",
                        onClick: () => void setStatus(p, "draft"),
                      },
              ]
            : undefined
        }
        empty={
          <EmptyState
            icon={<Icon.Storefront weight="duotone" />}
            title={t("empty")}
            description={t("emptyHint")}
            action={
              canWrite ? (
                <Button action="add" onClick={onCreate}>
                  {t("new")}
                </Button>
              ) : undefined
            }
          />
        }
      />
      {canWrite && editing ? (
        <ProductSheet
          key={editing.id}
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void reload()}
        />
      ) : null}
    </div>
  );
}

type VariantRow = { key: string; id?: string | undefined; label: string; stock: string };
type Audience = "club" | `section:${string}` | `team:${string}`;

const KIDS_SIZES = ["6", "8", "10", "12", "14"];
const ADULT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

let rowSeq = 0;
const newRow = (label = "", stock = ""): VariantRow => ({ key: `r${++rowSeq}`, label, stock });

/** Alta y edición de un producto: datos, a quién se vende, opciones con stock y la foto. */
function ProductSheet({
  product: initial,
  onClose,
  onSaved,
}: {
  product: StoreProduct | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("store.sheet");
  const c = useT("common");
  const cats = useT("storeCategories");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  // Tras crear el producto, la hoja sigue abierta sobre él para poder subir la foto.
  const [product, setProduct] = useState<StoreProduct | null>(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<StoreProductCategory>(initial?.category ?? "apparel");
  const [price, setPrice] = useState(initial ? centsToAmount(initial.priceCents) : "");
  /** Precio para socios o atletas con tarifa activa (ADR 0049): vacío, el mismo para todos. */
  const [memberPrice, setMemberPrice] = useState(
    initial?.memberPriceCents != null ? centsToAmount(initial.memberPriceCents) : "",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<StoreProduct["status"]>(initial?.status ?? "draft");
  const [visibility, setVisibility] = useState<StoreProductVisibility>(
    initial?.visibility ?? "members",
  );
  const [audience, setAudience] = useState<Audience>(
    initial?.team
      ? `team:${initial.team.id}`
      : initial?.section
        ? `section:${initial.section.id}`
        : "club",
  );
  const [availableUntil, setAvailableUntil] = useState(initial?.availableUntil ?? "");
  const hasLabels = (initial?.variants ?? []).some((v) => v.label !== null);
  const [withOptions, setWithOptions] = useState(hasLabels);
  const [rows, setRows] = useState<VariantRow[]>(() =>
    initial && hasLabels
      ? initial.variants.map((v) => ({
          key: v.id,
          id: v.id,
          label: v.label ?? "",
          stock: v.stock === null ? "" : String(v.stock),
        }))
      : [newRow()],
  );
  const single = initial && !hasLabels ? initial.variants[0] : undefined;
  const [singleStock, setSingleStock] = useState(
    single && single.stock !== null ? String(single.stock) : "",
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sections = useQuery({
    queryKey: ["org", slug, "sections", "all"],
    queryFn: () => apiFetch("/api/org/sections", { schema: SectionsResponseSchema }),
    retry: false,
  });
  const teams = useQuery({
    queryKey: ["org", slug, "teams"],
    queryFn: () => apiFetch("/api/org/teams", { schema: TeamsResponseSchema }),
    retry: false,
  });

  const parseStock = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isInteger(n) && n >= 0 ? n : Number.NaN;
  };

  function applyPreset(sizes: string[]) {
    const existing = new Set(rows.map((r) => r.label.trim().toLowerCase()).filter(Boolean));
    const kept = rows.filter((r) => r.label.trim() || r.id);
    setRows([
      ...kept,
      ...sizes.filter((s) => !existing.has(s.toLowerCase())).map((s) => newRow(s)),
    ]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const priceCents = Math.round(Number(price.replace(",", ".")) * 100);
    const memberPriceCents = memberPrice.trim()
      ? Math.round(Number(memberPrice.replace(",", ".")) * 100)
      : null;
    if (
      memberPriceCents !== null &&
      (!Number.isFinite(memberPriceCents) || memberPriceCents > priceCents)
    ) {
      setError(t("memberPriceTooHigh"));
      return;
    }
    const variants = withOptions
      ? rows
          .filter((r) => r.label.trim() || r.id)
          .map((r) => ({
            ...(r.id ? { id: r.id } : {}),
            label: r.label.trim() || null,
            stock: parseStock(r.stock),
          }))
      : [
          {
            ...(single
              ? { id: single.id }
              : product && !hasLabels && product.variants[0]
                ? { id: product.variants[0].id }
                : {}),
            label: null,
            stock: parseStock(singleStock),
          },
        ];
    if (variants.some((v) => Number.isNaN(v.stock))) {
      setError(t("invalidStock"));
      return;
    }
    const body = {
      name,
      category,
      priceCents,
      memberPriceCents,
      description: description.trim() || null,
      status,
      visibility,
      sectionId: audience.startsWith("section:") ? audience.slice(8) : null,
      teamId: audience.startsWith("team:") ? audience.slice(5) : null,
      availableUntil: availableUntil || null,
      variants,
    };
    const parsed = product
      ? StoreProductUpdateSchema.safeParse(body)
      : StoreProductCreateSchema.safeParse({
          ...body,
          status: status === "archived" ? "draft" : status,
        });
    if (!parsed.success || !Number.isFinite(priceCents)) {
      setError(variants.length === 0 ? t("noOptions") : t("invalid"));
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(
        product ? `/api/org/store/products/${product.id}` : "/api/org/store/products",
        {
          method: product ? "PATCH" : "POST",
          body: parsed.data,
          schema: StoreProductResponseSchema,
        },
      );
      onSaved();
      if (product) {
        toast("success", t("saved"));
        onClose();
      } else {
        // Nuevo: la hoja se queda sobre el producto para añadir la foto.
        toast("success", t("created"));
        setProduct(res.product);
        setRows(
          res.product.variants.some((v) => v.label !== null)
            ? res.product.variants.map((v) => ({
                key: v.id,
                id: v.id,
                label: v.label ?? "",
                stock: v.stock === null ? "" : String(v.stock),
              }))
            : [newRow()],
        );
      }
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  async function onImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !product) return;
    setUploading(true);
    setError(null);
    try {
      const small = await shrinkImage(file, STORE_IMAGE_MAX_SIDE_PX, STORE_IMAGE_MAX_BYTES);
      const res = await uploadFile(
        `/api/org/store/products/${product.id}/image`,
        small,
        StoreProductResponseSchema,
      );
      setProduct(res.product);
      toast("success", t("imageSaved"));
      onSaved();
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setUploading(false);
    }
  }

  async function removeImage() {
    if (!product) return;
    try {
      const res = await apiFetch(`/api/org/store/products/${product.id}/image`, {
        method: "DELETE",
        schema: StoreProductResponseSchema,
      });
      setProduct(res.product);
      onSaved();
    } catch (err) {
      setError(errors(errorKey(err)));
    }
  }

  const sectionList = sections.data?.sections ?? [];
  const teamList = (teams.data?.teams ?? []).filter((tm) => tm.status === "active");

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={product ? (initial ? t("editTitle") : t("createdTitle")) : t("title")}
      description={product && !initial ? t("createdDescription") : t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {product && !initial ? c("close") : c("cancel")}
          </Button>
          <Button
            action={product ? "save" : "add"}
            type="submit"
            form="product-form"
            loading={busy}
          >
            {product ? c("save") : t("submit")}
          </Button>
        </>
      }
    >
      <form id="product-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {product ? (
          <div className="flex items-center gap-4">
            <ProductImage url={product.imageUrl} category={category} size="md" />
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => void onImage(e)}
                  aria-label={t("image")}
                />
                <span
                  className={`inline-flex h-(--h-control) cursor-pointer items-center gap-2 rounded-control border border-control bg-surface px-4 text-secondary font-medium text-ink hover:bg-raised ${uploading ? "opacity-60" : ""}`}
                >
                  <Icon.Image size={18} aria-hidden="true" />
                  {product.imageUrl ? t("changeImage") : t("addImage")}
                </span>
              </label>
              {product.imageUrl ? (
                <Button variant="tertiary" action="delete" onClick={() => void removeImage()}>
                  {t("removeImage")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        <Field label={t("name")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("category")}>
            {(id) => (
              <Select
                id={id}
                value={category}
                onChange={(e) => setCategory(e.target.value as StoreProductCategory)}
              >
                {STORE_PRODUCT_CATEGORIES.map((k) => (
                  <option key={k} value={k}>
                    {cats(k)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("price")} hint={t("priceHint")}>
            {(id) => (
              <Input
                id={id}
                required
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label={t("memberPrice")} hint={t("memberPriceHint")}>
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={memberPrice}
              onChange={(e) => setMemberPrice(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("descriptionField")}>
          {(id) => (
            <textarea
              id={id}
              maxLength={2000}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-24 w-full rounded-field border border-control bg-surface px-3 py-2 text-body text-ink"
            />
          )}
        </Field>
        <fieldset className="flex flex-col gap-3">
          <legend className="pb-1 text-secondary font-medium text-ink">{t("options")}</legend>
          <label className="flex min-h-11 items-center gap-3 text-body text-ink">
            <input
              type="checkbox"
              checked={withOptions}
              onChange={(e) => setWithOptions(e.target.checked)}
              className="size-5 accent-club"
            />
            {t("withOptions")}
          </label>
          {withOptions ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => applyPreset(KIDS_SIZES)}>
                  {t("presetKids")}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => applyPreset(ADULT_SIZES)}>
                  {t("presetAdults")}
                </Button>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_7rem_2.75rem] gap-2 text-secondary font-medium text-ink">
                <span>{t("optionLabel")}</span>
                <span>{t("stock")}</span>
              </div>
              <ul className="flex flex-col gap-2">
                {rows.map((r) => (
                  <li
                    key={r.key}
                    className="grid grid-cols-[minmax(0,1fr)_7rem_2.75rem] items-center gap-2"
                  >
                    <Input
                      aria-label={t("optionLabel")}
                      maxLength={40}
                      value={r.label}
                      placeholder={t("optionPlaceholder")}
                      onChange={(e) =>
                        setRows(
                          rows.map((x) => (x.key === r.key ? { ...x, label: e.target.value } : x)),
                        )
                      }
                    />
                    <Input
                      aria-label={t("stockFor", { option: r.label || t("optionPlaceholder") })}
                      inputMode="numeric"
                      value={r.stock}
                      placeholder={t("unlimited")}
                      onChange={(e) =>
                        setRows(
                          rows.map((x) => (x.key === r.key ? { ...x, stock: e.target.value } : x)),
                        )
                      }
                    />
                    <IconButton
                      label={t("removeOption", { option: r.label || t("optionPlaceholder") })}
                      onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
                      disabled={rows.length === 1}
                    >
                      <Icon.Trash size={18} aria-hidden="true" className="text-danger" />
                    </IconButton>
                  </li>
                ))}
              </ul>
              <div>
                <Button
                  size="sm"
                  variant="tertiary"
                  action="add"
                  onClick={() => setRows([...rows, newRow()])}
                >
                  {t("addOption")}
                </Button>
              </div>
              <p className="text-label text-muted">{t("stockHint")}</p>
            </>
          ) : (
            <Field label={t("stock")} hint={t("stockHint")}>
              {(id) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  value={singleStock}
                  placeholder={t("unlimited")}
                  onChange={(e) => setSingleStock(e.target.value)}
                />
              )}
            </Field>
          )}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("audience")} hint={t("audienceHint")}>
            {(id) => (
              <Select
                id={id}
                value={audience}
                onChange={(e) => setAudience(e.target.value as Audience)}
              >
                <option value="club">{t("audienceClub")}</option>
                {sectionList.length > 0 ? (
                  <optgroup label={t("audienceSections")}>
                    {sectionList.map((s) => (
                      <option key={s.id} value={`section:${s.id}`}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {teamList.length > 0 ? (
                  <optgroup label={t("audienceTeams")}>
                    {teamList.map((tm) => (
                      <option key={tm.id} value={`team:${tm.id}`}>
                        {tm.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </Select>
            )}
          </Field>
          <Field label={t("availableUntil")} hint={t("availableUntilHint")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={availableUntil}
                onChange={(e) => setAvailableUntil(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("statusField")} hint={t(`statusHint.${status}`)}>
            {(id) => (
              <Select
                id={id}
                value={status}
                onChange={(e) => setStatus(e.target.value as StoreProduct["status"])}
              >
                <option value="draft">{t("statusDraft")}</option>
                <option value="active">{t("statusActive")}</option>
                {product ? <option value="archived">{t("statusArchived")}</option> : null}
              </Select>
            )}
          </Field>
          <Field label={t("visibility")} hint={t(`visibilityHint.${visibility}`)}>
            {(id) => (
              <Select
                id={id}
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as StoreProductVisibility)}
              >
                <option value="members">{t("visibilityMembers")}</option>
                <option value="public">{t("visibilityPublic")}</option>
              </Select>
            )}
          </Field>
        </div>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

// --- Pedido de mostrador ---

type CounterLine = { variantId: string; quantity: number };

/** El club vende en el mostrador a cualquier persona del club: elige persona, productos y talla. */
function CounterOrderSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (order: StoreOrder) => void;
}) {
  const t = useT("store.counter");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const [query, setQuery] = useState("");
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [lines, setLines] = useState<CounterLine[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const products = useQuery({
    queryKey: ["org", slug, "store", "products"],
    queryFn: () => apiFetch("/api/org/store/products", { schema: StoreProductsResponseSchema }),
  });
  const people = useQuery({
    queryKey: ["org", slug, "store", "people", query],
    queryFn: () =>
      apiFetch(`/api/org/store/people?q=${encodeURIComponent(query)}`, {
        schema: StorePeopleResponseSchema,
      }),
    enabled: !person && query.trim().length >= 2,
  });
  const sellable = (products.data?.products ?? []).filter((p) => p.status !== "archived");
  const variantOf = (id: string) => {
    for (const p of sellable) {
      const v = p.variants.find((x) => x.id === id);
      if (v) return { product: p, variant: v };
    }
    return null;
  };
  const chosen = sellable.find((p) => p.id === productId) ?? null;
  const total = lines.reduce(
    (sum, l) => sum + (variantOf(l.variantId)?.product.priceCents ?? 0) * l.quantity,
    0,
  );

  function chooseProduct(id: string) {
    setProductId(id);
    const p = sellable.find((x) => x.id === id);
    setVariantId(p && p.variants.length === 1 ? p.variants[0]!.id : "");
  }

  function addLine() {
    const qty = Number(quantity);
    if (!variantId || !Number.isInteger(qty) || qty < 1) return;
    setLines((current) => {
      const existing = current.find((l) => l.variantId === variantId);
      return existing
        ? current.map((l) => (l.variantId === variantId ? { ...l, quantity: l.quantity + qty } : l))
        : [...current, { variantId, quantity: qty }];
    });
    setProductId("");
    setVariantId("");
    setQuantity("1");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!person || lines.length === 0) {
      setError(t("incomplete"));
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/org/store/orders", {
        method: "POST",
        body: { personId: person.id, items: lines, note: note.trim() || null },
        schema: StoreOrderResponseSchema,
      });
      toast("success", t("created", { code: res.order.code }));
      onCreated(res.order);
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action="add"
            type="submit"
            form="counter-form"
            loading={busy}
            disabled={!person || lines.length === 0}
          >
            {t("submit", { total: money(total) })}
          </Button>
        </>
      }
    >
      <form id="counter-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("person")} hint={person ? undefined : t("personHint")}>
          {(id) =>
            person ? (
              <div className="flex items-center justify-between gap-3 rounded-field border border-border px-3 py-2">
                <span className="font-medium text-ink">{person.name}</span>
                <Button size="sm" variant="tertiary" onClick={() => setPerson(null)}>
                  {t("changePerson")}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Input
                  id={id}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {people.data ? (
                  <ul className="flex max-h-48 flex-col divide-y divide-line overflow-y-auto rounded-field border border-border">
                    {people.data.people.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-body hover:bg-raised"
                          onClick={() => setPerson({ id: p.id, name: personDisplayName(p) })}
                        >
                          <span>{personDisplayName(p)}</span>
                          <span className="text-secondary text-muted">{p.email ?? ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )
          }
        </Field>
        <Field label={t("product")}>
          {(id) => (
            <Select id={id} value={productId} onChange={(e) => chooseProduct(e.target.value)}>
              <option value="">{t("chooseProduct")}</option>
              {sellable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {money(p.priceCents)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-end gap-3">
          <Field label={t("option")}>
            {(id) => (
              <Select
                id={id}
                value={variantId}
                disabled={!chosen || chosen.variants.length === 1}
                onChange={(e) => setVariantId(e.target.value)}
              >
                <option value="">
                  {chosen && chosen.variants.length === 1 ? t("noOption") : t("chooseOption")}
                </option>
                {chosen && chosen.variants.length > 1
                  ? chosen.variants.map((v) => (
                      <option key={v.id} value={v.id} disabled={v.stock === 0}>
                        {v.label}
                        {v.stock !== null ? ` · ${t("left", { count: v.stock })}` : ""}
                      </option>
                    ))
                  : null}
              </Select>
            )}
          </Field>
          <Field label={t("quantity")}>
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            )}
          </Field>
          <Button variant="secondary" action="add" disabled={!variantId} onClick={addLine}>
            {t("addLine")}
          </Button>
        </div>
        {lines.length > 0 ? (
          <ul className="flex flex-col divide-y divide-line rounded-field border border-border">
            {lines.map((l) => {
              const found = variantOf(l.variantId);
              if (!found) return null;
              return (
                <li key={l.variantId} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body text-ink">
                      {l.quantity} × {found.product.name}
                      {found.variant.label ? ` (${found.variant.label})` : ""}
                    </span>
                  </span>
                  <span className="font-mono text-body text-ink">
                    {money(found.product.priceCents * l.quantity)}
                  </span>
                  <IconButton
                    label={t("removeLine")}
                    onClick={() => setLines(lines.filter((x) => x.variantId !== l.variantId))}
                  >
                    <Icon.Trash size={18} aria-hidden="true" className="text-danger" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        ) : null}
        <Field label={t("note")}>
          {(id) => (
            <Input id={id} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          )}
        </Field>
        <p className="text-secondary text-muted">{t("chargeHint")}</p>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}
