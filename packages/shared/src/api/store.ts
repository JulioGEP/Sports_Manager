import { z } from "zod";
import { PAYMENT_PROVIDERS } from "../fees.ts";
import {
  STORE_ORDER_CHANNELS,
  STORE_ORDER_STATUSES,
  STORE_PAYMENT_STATUSES,
  STORE_PRODUCT_CATEGORIES,
  STORE_PRODUCT_STATUSES,
  STORE_PRODUCT_VISIBILITIES,
} from "../store.ts";

/** Contratos de la tienda del club (ADR 0041). */

const Ref = z.object({ id: z.string(), name: z.string() });

// --- Gestión: quien tiene `org.store.read` ---

export const StoreVariantSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  /** Unidades disponibles; nulo, sin límite. */
  stock: z.number().int().nullable(),
  /** Unidades vendidas en pedidos no anulados. */
  sold: z.number().int().nonnegative(),
});
export type StoreVariant = z.infer<typeof StoreVariantSchema>;

export const StoreProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: z.enum(STORE_PRODUCT_CATEGORIES),
  priceCents: z.number().int(),
  /** Precio para atletas con tarifa y socios (ADR 0049). */
  memberPriceCents: z.number().int().nullable(),
  imageUrl: z.string().nullable(),
  status: z.enum(STORE_PRODUCT_STATUSES),
  visibility: z.enum(STORE_PRODUCT_VISIBILITIES),
  section: Ref.nullable(),
  team: Ref.nullable(),
  availableUntil: z.string().nullable(),
  variants: z.array(StoreVariantSchema),
  createdAt: z.string(),
});
export type StoreProduct = z.infer<typeof StoreProductSchema>;
export const StoreProductsResponseSchema = z.object({ products: z.array(StoreProductSchema) });
export type StoreProductsResponse = z.infer<typeof StoreProductsResponseSchema>;
export const StoreProductResponseSchema = z.object({ product: StoreProductSchema });

export const StoreOrderItemSchema = z.object({
  id: z.string(),
  productId: z.string().nullable(),
  variantId: z.string().nullable(),
  /** El nombre y la opción tal como se compraron: el producto puede cambiar después. */
  productName: z.string(),
  variantLabel: z.string().nullable(),
  unitPriceCents: z.number().int(),
  quantity: z.number().int().positive(),
  imageUrl: z.string().nullable(),
});
export type StoreOrderItem = z.infer<typeof StoreOrderItemSchema>;

export const StoreOrderSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  /** `T-0012`. */
  code: z.string(),
  /** Para quién es: el deportista (o el propio adulto). */
  person: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }),
  placedBy: z.object({ userId: z.string(), name: z.string() }).nullable(),
  channel: z.enum(STORE_ORDER_CHANNELS),
  status: z.enum(STORE_ORDER_STATUSES),
  totalCents: z.number().int().nonnegative(),
  note: z.string().nullable(),
  items: z.array(StoreOrderItemSchema),
  /** El cobro, a través de su cargo de cuotas. */
  payment: z.object({
    status: z.enum(STORE_PAYMENT_STATUSES),
    chargeId: z.string().nullable(),
    paidCents: z.number().int().nonnegative(),
    dueOn: z.string().nullable(),
    /** Se puede pagar en línea (el club cobra por Stripe y el cargo sigue abierto). */
    payableOnline: z.boolean(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StoreOrder = z.infer<typeof StoreOrderSchema>;

export const StoreOrdersResponseSchema = z.object({
  orders: z.array(StoreOrderSchema),
  totals: z.object({
    /** Pedidos recibidos sin preparar. */
    toPrepare: z.number().int().nonnegative(),
    /** Listos para recoger. */
    ready: z.number().int().nonnegative(),
    /** Lo que queda por cobrar de los pedidos no anulados. */
    unpaidCents: z.number().int().nonnegative(),
    unpaidCount: z.number().int().nonnegative(),
    /** Lo cobrado de los pedidos de la lista. */
    paidCents: z.number().int().nonnegative(),
  }),
});
export type StoreOrdersResponse = z.infer<typeof StoreOrdersResponseSchema>;
export const StoreOrderResponseSchema = z.object({ order: StoreOrderSchema });

/** Personas del club para un pedido en el mostrador: lo justo para elegir. */
export const StorePeopleResponseSchema = z.object({
  people: z.array(
    z.object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      email: z.string().nullable(),
    }),
  ),
});

// --- Comprar: la familia de un menor o el deportista adulto ---

export const StoreCatalogVariantSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  inStock: z.boolean(),
  /** Cuántas quedan, solo cuando son pocas (para avisar sin enseñar el almacén). */
  lowStock: z.number().int().nonnegative().nullable(),
});

export const StoreCatalogProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: z.enum(STORE_PRODUCT_CATEGORIES),
  priceCents: z.number().int(),
  /** Lo que paga quien tiene tarifa activa o es socio (ADR 0049). */
  memberPriceCents: z.number().int().nullable(),
  imageUrl: z.string().nullable(),
  availableUntil: z.string().nullable(),
  variants: z.array(StoreCatalogVariantSchema),
  /** Para quién de los suyos se puede comprar (un producto de un equipo, solo para sus jugadores). */
  beneficiaryIds: z.array(z.string()),
});
export type StoreCatalogProduct = z.infer<typeof StoreCatalogProductSchema>;

export const StoreBeneficiarySchema = z.object({
  personId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  /** `self`: el propio deportista adulto; `ward`: un menor del que es familia. */
  kind: z.enum(["self", "ward"]),
  /** Paga el precio para socios (ADR 0049). */
  memberPrice: z.boolean(),
});
export type StoreBeneficiary = z.infer<typeof StoreBeneficiarySchema>;

export const StoreCatalogResponseSchema = z.object({
  products: z.array(StoreCatalogProductSchema),
  beneficiaries: z.array(StoreBeneficiarySchema),
  provider: z.enum(PAYMENT_PROVIDERS),
});
export type StoreCatalogResponse = z.infer<typeof StoreCatalogResponseSchema>;

export const MyStoreOrdersResponseSchema = z.object({
  orders: z.array(StoreOrderSchema),
  provider: z.enum(PAYMENT_PROVIDERS),
});
export type MyStoreOrdersResponse = z.infer<typeof MyStoreOrdersResponseSchema>;

// --- Desarrolladores: el catálogo público de la web del club ---

export const DeveloperSettingsSchema = z.object({
  /** Clave publicable; nula, catálogo público apagado. */
  publicKey: z.string().nullable(),
  /** Productos activos y públicos: lo que verá la web del club. */
  publicProducts: z.number().int().nonnegative(),
  /** Base de la API pública, absoluta. */
  apiBase: z.string(),
});
export type DeveloperSettings = z.infer<typeof DeveloperSettingsSchema>;
export const DeveloperSettingsResponseSchema = z.object({ developer: DeveloperSettingsSchema });

export const PublicCatalogOptionSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  inStock: z.boolean(),
});

export const PublicCatalogProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: z.enum(STORE_PRODUCT_CATEGORIES),
  priceCents: z.number().int(),
  currency: z.literal("EUR"),
  /** Absoluta, para un `<img>` en cualquier web. */
  imageUrl: z.string().nullable(),
  availableUntil: z.string().nullable(),
  inStock: z.boolean(),
  options: z.array(PublicCatalogOptionSchema),
  /** Dónde se compra: la tienda del club en la app (con su cuenta). */
  buyUrl: z.string(),
});
export type PublicCatalogProduct = z.infer<typeof PublicCatalogProductSchema>;

export const PublicClubSchema = z.object({
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  storeUrl: z.string(),
});

export const PublicCatalogResponseSchema = z.object({
  club: PublicClubSchema,
  products: z.array(PublicCatalogProductSchema),
});
export type PublicCatalogResponse = z.infer<typeof PublicCatalogResponseSchema>;
export const PublicCatalogProductResponseSchema = z.object({
  club: PublicClubSchema,
  product: PublicCatalogProductSchema,
});
