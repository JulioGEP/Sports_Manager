import { z } from "zod";
import { LOGO_CONTENT_TYPES } from "./organizations.ts";
import { ageOn, DateOnlySchema } from "./structure.ts";

/**
 * Tienda del club (ADR 0041). El club vende productos físicos (camisetas, material de entreno) y
 * extras (la cena del equipo, una salida) a sus deportistas y familias. Un producto tiene una o
 * varias opciones (tallas) con su stock; un pedido es lo que alguien compra para una persona, y
 * se cobra con un cargo de cuotas: un solo sitio para lo que se debe y una sola forma de pagar.
 * Importes en céntimos, como las cuotas.
 */

export const STORE_PRODUCT_CATEGORIES = ["apparel", "equipment", "event", "trip", "other"] as const;
export type StoreProductCategory = (typeof STORE_PRODUCT_CATEGORIES)[number];
export const StoreProductCategorySchema = z.enum(STORE_PRODUCT_CATEGORIES);

/** Borrador: solo lo ve quien gestiona la tienda. Activo: a la venta. Archivado: retirado. */
export const STORE_PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type StoreProductStatus = (typeof STORE_PRODUCT_STATUSES)[number];
export const StoreProductStatusSchema = z.enum(STORE_PRODUCT_STATUSES);

/** `members`: solo en la tienda de la app. `public`: además, en el catálogo público de la web del club. */
export const STORE_PRODUCT_VISIBILITIES = ["members", "public"] as const;
export type StoreProductVisibility = (typeof STORE_PRODUCT_VISIBILITIES)[number];
export const StoreProductVisibilitySchema = z.enum(STORE_PRODUCT_VISIBILITIES);

/** Recibido (por preparar), listo para recoger, entregado o anulado (devuelve el stock). */
export const STORE_ORDER_STATUSES = ["pending", "ready", "delivered", "cancelled"] as const;
export type StoreOrderStatus = (typeof STORE_ORDER_STATUSES)[number];
export const StoreOrderStatusSchema = z.enum(STORE_ORDER_STATUSES);

/** Por dónde entró el pedido: la familia o el deportista desde la app, o el club en el mostrador. */
export const STORE_ORDER_CHANNELS = ["app", "counter"] as const;
export type StoreOrderChannel = (typeof STORE_ORDER_CHANNELS)[number];

/** Estado del cobro de un pedido. Sale de su cargo; `free` es un pedido de importe cero, sin cargo. */
export const STORE_PAYMENT_STATUSES = ["pending", "overdue", "paid", "cancelled", "free"] as const;
export type StorePaymentStatus = (typeof STORE_PAYMENT_STATUSES)[number];

/** Con este stock o menos, una opción avisa de que quedan pocas. */
export const STORE_LOW_STOCK = 5;
/** Días que da el club para pagar un pedido antes de que su cargo venza. */
export const STORE_PAYMENT_DAYS = 7;
export const STORE_MAX_VARIANTS = 30;
export const STORE_MAX_ORDER_LINES = 30;
export const STORE_MAX_LINE_QUANTITY = 99;

export const STORE_IMAGE_CONTENT_TYPES = LOGO_CONTENT_TYPES;
export const STORE_IMAGE_MAX_BYTES = 1_500_000;
export const STORE_IMAGE_MAX_SIDE_PX = 1200;

/** Mayoría de edad para la tienda: la familia compra para los menores; el adulto compra lo suyo. */
export const ADULT_AGE = 18;

/**
 * Si una persona es menor hoy. Sin fecha de nacimiento no se puede saber y se trata como menor:
 * una ficha con familia vinculada es, casi siempre, la de un menor.
 */
export function isMinor(birthDate: string | null | undefined, on: Date = new Date()): boolean {
  const age = ageOn(birthDate, on);
  return age === null || age < ADULT_AGE;
}

/** Número visible del pedido: `T-0012`. */
export function storeOrderCode(number: number): string {
  return `T-${String(number).padStart(4, "0")}`;
}

const Cents = z.number().int().min(0).max(10_000_000);

/** Una opción del producto (una talla, un turno). Sin etiqueta: el producto no tiene opciones. */
export const StoreVariantInputSchema = z.object({
  /** La opción que ya existe; sin id, una nueva. */
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(40).nullable(),
  /** Unidades disponibles. Nulo: sin límite (una inscripción, un pago extra). */
  stock: z.number().int().min(0).max(100_000).nullable(),
});
export type StoreVariantInput = z.infer<typeof StoreVariantInputSchema>;

const VariantsSchema = z
  .array(StoreVariantInputSchema)
  .min(1)
  .max(STORE_MAX_VARIANTS)
  .refine((list) => list.length === 1 || list.every((v) => v.label !== null), {
    message: "Con varias opciones, todas necesitan nombre.",
  })
  .refine(
    (list) => {
      const labels = list.map((v) => v.label?.toLowerCase()).filter(Boolean);
      return new Set(labels).size === labels.length;
    },
    { message: "Hay dos opciones con el mismo nombre." },
  );

export const StoreProductCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(2000).nullable().optional(),
    category: StoreProductCategorySchema,
    priceCents: Cents,
    status: z.enum(["draft", "active"]).default("draft"),
    visibility: StoreProductVisibilitySchema.default("members"),
    /** A quién se vende en la app: a todo el club, a una sección o a un solo equipo. */
    sectionId: z.string().uuid().nullable().optional(),
    teamId: z.string().uuid().nullable().optional(),
    /** Último día de venta (las inscripciones a una cena cierran). Nulo: sin fecha. */
    availableUntil: DateOnlySchema.nullable().optional(),
    variants: VariantsSchema,
  })
  .refine((v) => !(v.sectionId && v.teamId), {
    message: "Elige una sección o un equipo, no los dos.",
    path: ["teamId"],
  });
export type StoreProductCreate = z.infer<typeof StoreProductCreateSchema>;

export const StoreProductUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    category: StoreProductCategorySchema.optional(),
    priceCents: Cents.optional(),
    status: StoreProductStatusSchema.optional(),
    visibility: StoreProductVisibilitySchema.optional(),
    sectionId: z.string().uuid().nullable().optional(),
    teamId: z.string().uuid().nullable().optional(),
    availableUntil: DateOnlySchema.nullable().optional(),
    /** La lista completa de opciones: las que no vienen se quitan. Los pedidos guardan su nombre. */
    variants: VariantsSchema.optional(),
  })
  .refine((v) => !(v.sectionId && v.teamId), {
    message: "Elige una sección o un equipo, no los dos.",
    path: ["teamId"],
  });
export type StoreProductUpdate = z.infer<typeof StoreProductUpdateSchema>;

export const StoreOrderLineInputSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(STORE_MAX_LINE_QUANTITY),
});
export type StoreOrderLineInput = z.infer<typeof StoreOrderLineInputSchema>;

/** Un pedido: para quién es, qué lleva y una nota (el nombre para la camiseta, una alergia). */
export const StoreOrderCreateSchema = z.object({
  personId: z.string().uuid(),
  items: z
    .array(StoreOrderLineInputSchema)
    .min(1)
    .max(STORE_MAX_ORDER_LINES)
    .refine((list) => new Set(list.map((l) => l.variantId)).size === list.length, {
      message: "Una opción solo puede ir una vez en el pedido.",
    }),
  note: z.string().trim().max(300).nullable().optional(),
});
export type StoreOrderCreate = z.infer<typeof StoreOrderCreateSchema>;

/** Lo que el club cambia de un pedido: en qué punto está. Anular devuelve el stock. */
export const StoreOrderUpdateSchema = z.object({ status: StoreOrderStatusSchema });
export type StoreOrderUpdate = z.infer<typeof StoreOrderUpdateSchema>;

/**
 * Cambios de estado de un pedido. Entre recibido, listo y entregado se va y se vuelve (un toque
 * equivocado se deshace); anular solo antes de entregar, y un pedido anulado ya no cambia.
 */
export function canMoveOrder(from: StoreOrderStatus, to: StoreOrderStatus): boolean {
  if (from === to || from === "cancelled") return false;
  if (to === "cancelled") return from !== "delivered";
  return true;
}

/**
 * Clave publicable del catálogo (ADR 0041): identifica al club en la API pública y va en el código
 * de su web, como la clave publicable de Stripe. No da acceso a nada que no sea público.
 */
export const PUBLIC_KEY_PATTERN = /^pk_[a-f0-9]{32}$/;
export const PUBLIC_KEY_HEADER = "x-sm-key";
export const PUBLIC_KEY_QUERY = "key";
