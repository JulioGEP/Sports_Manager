import { schema, type Database } from "@sportsmanager/db";
import {
  canMoveOrder,
  isMinor,
  STORE_PAYMENT_DAYS,
  storeOrderCode,
  type FeeChargeStatus,
  type StoreOrderChannel,
  type StoreOrderCreate,
  type StoreOrderStatus,
  type StoreProductCategory,
  type StoreProductCreate,
  type StoreProductStatus,
  type StoreProductUpdate,
  type StoreProductVisibility,
  type StoreVariantInput,
} from "@sportsmanager/shared";
import { and, asc, desc, eq, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import { isUniqueViolation } from "./db.ts";
import type { BlobStore } from "./logos.ts";
import { createNetlifyBlobStore } from "./logos.ts";
import type { OrgScope } from "./scope.ts";

/**
 * Tienda del club (ADR 0041). Toda consulta lleva el ámbito del club (ADR 0015). Un pedido baja el
 * stock en la misma transacción que lo crea (con las opciones bloqueadas), y se cobra con un cargo
 * de cuotas: el pago a mano, Stripe y el webhook son los de siempre. Anular devuelve el stock.
 */

export const createNetlifyStoreImageStore = (): BlobStore => createNetlifyBlobStore("store-images");

export interface StoreVariantRecord {
  id: string;
  label: string | null;
  stock: number | null;
  sold: number;
}

export interface StoreProductRecord {
  id: string;
  name: string;
  description: string | null;
  category: StoreProductCategory;
  priceCents: number;
  imageBlobKey: string | null;
  status: StoreProductStatus;
  visibility: StoreProductVisibility;
  section: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  availableUntil: string | null;
  variants: StoreVariantRecord[];
  createdAt: Date;
}

export interface StoreOrderItemRecord {
  id: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  variantLabel: string | null;
  unitPriceCents: number;
  quantity: number;
  productImageKey: string | null;
}

export interface StoreOrderRecord {
  id: string;
  number: number;
  person: { id: string; firstName: string; lastName: string };
  placedBy: { userId: string; name: string } | null;
  channel: StoreOrderChannel;
  status: StoreOrderStatus;
  totalCents: number;
  note: string | null;
  items: StoreOrderItemRecord[];
  charge: {
    id: string;
    status: FeeChargeStatus;
    amountCents: number;
    paidCents: number;
    dueOn: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Para quién puede comprar una cuenta: ella misma (deportista adulta) o un menor del que es familia. */
export interface StoreBeneficiaryRecord {
  personId: string;
  firstName: string;
  lastName: string;
  kind: "self" | "ward";
  teamIds: string[];
  sectionIds: string[];
}

export interface StoreOrderFilter {
  status?: StoreOrderStatus | undefined;
  personId?: string | undefined;
}

type CreateOrderOutcome =
  | { outcome: "created"; order: StoreOrderRecord }
  | { outcome: "unknown_person" }
  | { outcome: "not_beneficiary" }
  | { outcome: "unknown_variant" }
  | { outcome: "unavailable"; product: string }
  | { outcome: "out_of_stock"; product: string; variant: string | null; left: number };

/** Fecha de hoy `AAAA-MM-DD` en UTC, como el resto de fechas sin hora. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Versión pública de la foto para la URL: la parte aleatoria de la clave, sin ids. */
export function storeImageVersion(key: string): string {
  return key.split("/").at(-1) ?? key;
}

/** Ruta pública de la foto de un producto. Sin club ni sesión: el id del producto basta. */
export function storeImageUrlFor(key: string | null, productId: string): string | null {
  return key ? `/api/store/products/${productId}/image?v=${storeImageVersion(key)}` : null;
}

/** Un producto se vende a esta persona si es de todo el club, de su sección o de su equipo. */
function audienceMatches(
  product: { sectionId: string | null; teamId: string | null },
  beneficiary: { teamIds: string[]; sectionIds: string[] },
): boolean {
  if (product.teamId) return beneficiary.teamIds.includes(product.teamId);
  if (product.sectionId) return beneficiary.sectionIds.includes(product.sectionId);
  return true;
}

export function storeRepo(db: () => Database, images: BlobStore) {
  // --- Productos ---

  type ProductRow = typeof schema.storeProducts.$inferSelect;

  async function productRows(
    scope: OrgScope,
    filter: { id?: string; statuses?: readonly StoreProductStatus[]; visibility?: string } = {},
  ) {
    return db()
      .select({
        product: schema.storeProducts,
        sectionName: schema.sections.name,
        teamName: schema.teams.name,
      })
      .from(schema.storeProducts)
      .leftJoin(schema.sections, eq(schema.sections.id, schema.storeProducts.sectionId))
      .leftJoin(schema.teams, eq(schema.teams.id, schema.storeProducts.teamId))
      .where(
        and(
          eq(schema.storeProducts.organizationId, scope.organizationId),
          ...(filter.id ? [eq(schema.storeProducts.id, filter.id)] : []),
          ...(filter.statuses ? [inArray(schema.storeProducts.status, [...filter.statuses])] : []),
          ...(filter.visibility ? [eq(schema.storeProducts.visibility, filter.visibility)] : []),
        ),
      )
      .orderBy(asc(schema.storeProducts.status), asc(schema.storeProducts.name));
  }

  async function variantsOf(scope: OrgScope, productIds: string[]) {
    const map = new Map<string, StoreVariantRecord[]>();
    if (productIds.length === 0) return map;
    const sold = db()
      .select({
        variantId: schema.storeOrderItems.variantId,
        sold: sql<number>`sum(${schema.storeOrderItems.quantity})::int`.as("sold"),
      })
      .from(schema.storeOrderItems)
      .innerJoin(schema.storeOrders, eq(schema.storeOrders.id, schema.storeOrderItems.orderId))
      .where(
        and(
          eq(schema.storeOrderItems.organizationId, scope.organizationId),
          ne(schema.storeOrders.status, "cancelled"),
        ),
      )
      .groupBy(schema.storeOrderItems.variantId)
      .as("sold");
    const rows = await db()
      .select({
        id: schema.storeProductVariants.id,
        productId: schema.storeProductVariants.productId,
        label: schema.storeProductVariants.label,
        stock: schema.storeProductVariants.stock,
        sold: sold.sold,
      })
      .from(schema.storeProductVariants)
      .leftJoin(sold, eq(sold.variantId, schema.storeProductVariants.id))
      .where(
        and(
          eq(schema.storeProductVariants.organizationId, scope.organizationId),
          inArray(schema.storeProductVariants.productId, productIds),
        ),
      )
      .orderBy(
        asc(schema.storeProductVariants.sortOrder),
        asc(schema.storeProductVariants.createdAt),
      );
    for (const row of rows) {
      const list = map.get(row.productId) ?? [];
      list.push({ id: row.id, label: row.label, stock: row.stock, sold: Number(row.sold ?? 0) });
      map.set(row.productId, list);
    }
    return map;
  }

  async function toProductRecords(
    scope: OrgScope,
    rows: { product: ProductRow; sectionName: string | null; teamName: string | null }[],
  ): Promise<StoreProductRecord[]> {
    const variants = await variantsOf(
      scope,
      rows.map((r) => r.product.id),
    );
    return rows.map(({ product, sectionName, teamName }) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category as StoreProductCategory,
      priceCents: product.priceCents,
      imageBlobKey: product.imageBlobKey,
      status: product.status as StoreProductStatus,
      visibility: product.visibility as StoreProductVisibility,
      section:
        product.sectionId && sectionName ? { id: product.sectionId, name: sectionName } : null,
      team: product.teamId && teamName ? { id: product.teamId, name: teamName } : null,
      availableUntil: product.availableUntil,
      variants: variants.get(product.id) ?? [],
      createdAt: product.createdAt,
    }));
  }

  async function productById(scope: OrgScope, id: string): Promise<StoreProductRecord | null> {
    return (await toProductRecords(scope, await productRows(scope, { id })))[0] ?? null;
  }

  async function audienceValid(
    scope: OrgScope,
    input: { sectionId?: string | null | undefined; teamId?: string | null | undefined },
  ): Promise<"ok" | "unknown_section" | "unknown_team"> {
    if (input.sectionId) {
      const rows = await db()
        .select({ id: schema.sections.id })
        .from(schema.sections)
        .where(
          and(
            eq(schema.sections.organizationId, scope.organizationId),
            eq(schema.sections.id, input.sectionId),
          ),
        )
        .limit(1);
      if (rows.length === 0) return "unknown_section";
    }
    if (input.teamId) {
      const rows = await db()
        .select({ id: schema.teams.id })
        .from(schema.teams)
        .where(
          and(
            eq(schema.teams.organizationId, scope.organizationId),
            eq(schema.teams.id, input.teamId),
          ),
        )
        .limit(1);
      if (rows.length === 0) return "unknown_team";
    }
    return "ok";
  }

  /** Deja las opciones del producto como dice la lista: actualiza, crea y quita. */
  async function replaceVariants(
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    scope: OrgScope,
    productId: string,
    variants: StoreVariantInput[],
  ): Promise<void> {
    const existing = await tx
      .select({ id: schema.storeProductVariants.id })
      .from(schema.storeProductVariants)
      .where(
        and(
          eq(schema.storeProductVariants.organizationId, scope.organizationId),
          eq(schema.storeProductVariants.productId, productId),
        ),
      );
    // Solo se tocan opciones de este producto: un id ajeno se trata como opción nueva.
    const known = new Set(existing.map((v) => v.id));
    const keep = variants.flatMap((v) => (v.id && known.has(v.id) ? [v.id] : []));
    await tx
      .delete(schema.storeProductVariants)
      .where(
        and(
          eq(schema.storeProductVariants.organizationId, scope.organizationId),
          eq(schema.storeProductVariants.productId, productId),
          ...(keep.length > 0 ? [notInArray(schema.storeProductVariants.id, keep)] : []),
        ),
      );
    for (const [index, v] of variants.entries()) {
      if (v.id && known.has(v.id)) {
        await tx
          .update(schema.storeProductVariants)
          .set({ label: v.label, stock: v.stock, sortOrder: (index + 1) * 10 })
          .where(eq(schema.storeProductVariants.id, v.id));
      } else {
        await tx.insert(schema.storeProductVariants).values({
          organizationId: scope.organizationId,
          productId,
          label: v.label,
          stock: v.stock,
          sortOrder: (index + 1) * 10,
        });
      }
    }
  }

  // --- Personas para las que se compra ---

  /** Equipos y secciones de esta temporada de unas personas (por su ficha deportiva activa). */
  async function teamsOfPeople(scope: OrgScope, personIds: string[]) {
    const map = new Map<string, { teamIds: string[]; sectionIds: string[] }>();
    if (personIds.length === 0) return map;
    const rows = await db()
      .select({
        personId: schema.players.personId,
        teamId: schema.teams.id,
        sectionId: schema.teams.sectionId,
      })
      .from(schema.teamPlayers)
      .innerJoin(schema.players, eq(schema.players.id, schema.teamPlayers.playerId))
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamPlayers.teamId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
      .where(
        and(
          eq(schema.teamPlayers.organizationId, scope.organizationId),
          inArray(schema.players.personId, personIds),
          eq(schema.seasons.isCurrent, true),
          eq(schema.teams.status, "active"),
        ),
      );
    for (const row of rows) {
      const entry = map.get(row.personId) ?? { teamIds: [], sectionIds: [] };
      if (!entry.teamIds.includes(row.teamId)) entry.teamIds.push(row.teamId);
      if (row.sectionId && !entry.sectionIds.includes(row.sectionId))
        entry.sectionIds.push(row.sectionId);
      map.set(row.personId, entry);
    }
    return map;
  }

  /**
   * Para quién puede comprar una cuenta (ADR 0041): para sí misma si es deportista adulta con su
   * cuenta, y para los menores de los que es familia. La familia de un adulto no compra por él.
   */
  async function beneficiariesFor(
    scope: OrgScope,
    userId: string,
  ): Promise<StoreBeneficiaryRecord[]> {
    const own = await db()
      .select({
        personId: schema.people.id,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
        birthDate: schema.people.birthDate,
      })
      .from(schema.players)
      .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
      .where(
        and(
          eq(schema.players.organizationId, scope.organizationId),
          eq(schema.people.userId, userId),
          eq(schema.players.status, "active"),
        ),
      )
      .limit(1);
    const wards = await db()
      .select({
        personId: schema.people.id,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
        birthDate: schema.people.birthDate,
      })
      .from(schema.playerGuardians)
      .innerJoin(schema.players, eq(schema.players.id, schema.playerGuardians.playerId))
      .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
      .where(
        and(
          eq(schema.playerGuardians.organizationId, scope.organizationId),
          eq(schema.playerGuardians.userId, userId),
          eq(schema.players.status, "active"),
        ),
      )
      .orderBy(asc(schema.people.birthDate));
    const list: Omit<StoreBeneficiaryRecord, "teamIds" | "sectionIds">[] = [];
    // Con cuenta propia y sin fecha de nacimiento se le trata como adulto: entra él mismo.
    for (const p of own) {
      if (p.birthDate === null || !isMinor(p.birthDate)) list.push({ ...p, kind: "self" });
    }
    for (const p of wards) {
      if (isMinor(p.birthDate) && !list.some((b) => b.personId === p.personId))
        list.push({ ...p, kind: "ward" });
    }
    const teams = await teamsOfPeople(
      scope,
      list.map((b) => b.personId),
    );
    return list.map(({ personId, firstName, lastName, kind }) => ({
      personId,
      firstName,
      lastName,
      kind,
      teamIds: teams.get(personId)?.teamIds ?? [],
      sectionIds: teams.get(personId)?.sectionIds ?? [],
    }));
  }

  /** Personas cuyos pedidos ve una cuenta: la suya y todas las de los jugadores de los que es familia. */
  async function personIdsForUser(scope: OrgScope, userId: string): Promise<string[]> {
    const own = await db()
      .select({ id: schema.people.id })
      .from(schema.people)
      .where(
        and(
          eq(schema.people.organizationId, scope.organizationId),
          eq(schema.people.userId, userId),
        ),
      );
    const wards = await db()
      .select({ id: schema.players.personId })
      .from(schema.playerGuardians)
      .innerJoin(schema.players, eq(schema.players.id, schema.playerGuardians.playerId))
      .where(
        and(
          eq(schema.playerGuardians.organizationId, scope.organizationId),
          eq(schema.playerGuardians.userId, userId),
        ),
      );
    return [...new Set([...own.map((r) => r.id), ...wards.map((r) => r.id)])];
  }

  /** A la venta hoy: activo y sin pasar su último día de venta. */
  const onSale = () =>
    and(
      eq(schema.storeProducts.status, "active"),
      or(
        isNull(schema.storeProducts.availableUntil),
        sql`${schema.storeProducts.availableUntil} >= current_date`,
      ),
    );

  // --- Pedidos ---

  const orderSelection = {
    order: schema.storeOrders,
    firstName: schema.people.firstName,
    lastName: schema.people.lastName,
    placedByName: schema.users.name,
    chargeStatus: schema.feeCharges.status,
    chargeAmount: schema.feeCharges.amountCents,
    chargePaid: schema.feeCharges.paidCents,
    chargeDue: schema.feeCharges.dueOn,
  };
  const orderQuery = () =>
    db()
      .select(orderSelection)
      .from(schema.storeOrders)
      .innerJoin(schema.people, eq(schema.people.id, schema.storeOrders.personId))
      .leftJoin(schema.users, eq(schema.users.id, schema.storeOrders.placedBy))
      .leftJoin(schema.feeCharges, eq(schema.feeCharges.id, schema.storeOrders.chargeId));
  type OrderRow = Awaited<ReturnType<ReturnType<typeof orderQuery>["where"]>>[number];

  /** Los cargos pendientes con fecha pasada pasan a vencidos (como en cuotas: al leer, sin cron). */
  async function markOverdue(scope: OrgScope): Promise<void> {
    await db()
      .update(schema.feeCharges)
      .set({ status: "overdue" })
      .where(
        and(
          eq(schema.feeCharges.organizationId, scope.organizationId),
          eq(schema.feeCharges.status, "pending"),
          sql`${schema.feeCharges.dueOn} < current_date`,
        ),
      );
  }

  async function toOrderRecords(scope: OrgScope, rows: OrderRow[]): Promise<StoreOrderRecord[]> {
    const ids = rows.map((r) => r.order.id);
    const items = new Map<string, StoreOrderItemRecord[]>();
    if (ids.length > 0) {
      const itemRows = await db()
        .select({
          item: schema.storeOrderItems,
          imageKey: schema.storeProducts.imageBlobKey,
        })
        .from(schema.storeOrderItems)
        .leftJoin(
          schema.storeProducts,
          eq(schema.storeProducts.id, schema.storeOrderItems.productId),
        )
        .where(
          and(
            eq(schema.storeOrderItems.organizationId, scope.organizationId),
            inArray(schema.storeOrderItems.orderId, ids),
          ),
        )
        .orderBy(asc(schema.storeOrderItems.createdAt), asc(schema.storeOrderItems.productName));
      for (const { item, imageKey } of itemRows) {
        const list = items.get(item.orderId) ?? [];
        list.push({
          id: item.id,
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          variantLabel: item.variantLabel,
          unitPriceCents: item.unitPriceCents,
          quantity: item.quantity,
          productImageKey: imageKey,
        });
        items.set(item.orderId, list);
      }
    }
    return rows.map((r) => ({
      id: r.order.id,
      number: r.order.number,
      person: { id: r.order.personId, firstName: r.firstName, lastName: r.lastName },
      placedBy:
        r.order.placedBy && r.placedByName
          ? { userId: r.order.placedBy, name: r.placedByName }
          : null,
      channel: r.order.channel as StoreOrderChannel,
      status: r.order.status as StoreOrderStatus,
      totalCents: r.order.totalCents,
      note: r.order.note,
      items: items.get(r.order.id) ?? [],
      charge:
        r.order.chargeId && r.chargeStatus && r.chargeDue
          ? {
              id: r.order.chargeId,
              status: r.chargeStatus as FeeChargeStatus,
              amountCents: r.chargeAmount ?? 0,
              paidCents: r.chargePaid ?? 0,
              dueOn: r.chargeDue,
            }
          : null,
      createdAt: r.order.createdAt,
      updatedAt: r.order.updatedAt,
    }));
  }

  async function orderById(scope: OrgScope, id: string): Promise<StoreOrderRecord | null> {
    const rows = await orderQuery().where(
      and(
        eq(schema.storeOrders.organizationId, scope.organizationId),
        eq(schema.storeOrders.id, id),
      ),
    );
    return (await toOrderRecords(scope, rows))[0] ?? null;
  }

  /**
   * Crea un pedido: bloquea las opciones, comprueba que se venden a esta persona y que hay stock,
   * baja el stock, numera el pedido y abre su cargo. Todo o nada.
   */
  async function createOrder(
    scope: OrgScope,
    input: StoreOrderCreate,
    options: {
      placedBy: string;
      channel: StoreOrderChannel;
      /** En la app: las personas para las que puede comprar quien pide. En el mostrador, nulo. */
      beneficiaries: StoreBeneficiaryRecord[] | null;
    },
  ): Promise<CreateOrderOutcome> {
    const beneficiary = options.beneficiaries?.find((b) => b.personId === input.personId) ?? null;
    if (options.beneficiaries && !beneficiary) return { outcome: "not_beneficiary" };
    const person = await db()
      .select({ id: schema.people.id })
      .from(schema.people)
      .where(
        and(
          eq(schema.people.organizationId, scope.organizationId),
          eq(schema.people.id, input.personId),
        ),
      )
      .limit(1);
    if (person.length === 0) return { outcome: "unknown_person" };
    const today = todayIso();
    type TxOutcome =
      Exclude<CreateOrderOutcome, { outcome: "created" }> | { outcome: "created"; id: string };

    for (let attempt = 0; ; attempt++) {
      try {
        const result = await db().transaction(async (tx): Promise<TxOutcome> => {
          const variantIds = input.items.map((i) => i.variantId);
          const lines = await tx
            .select({
              variantId: schema.storeProductVariants.id,
              label: schema.storeProductVariants.label,
              stock: schema.storeProductVariants.stock,
              productId: schema.storeProducts.id,
              productName: schema.storeProducts.name,
              priceCents: schema.storeProducts.priceCents,
              status: schema.storeProducts.status,
              availableUntil: schema.storeProducts.availableUntil,
              sectionId: schema.storeProducts.sectionId,
              teamId: schema.storeProducts.teamId,
            })
            .from(schema.storeProductVariants)
            .innerJoin(
              schema.storeProducts,
              eq(schema.storeProducts.id, schema.storeProductVariants.productId),
            )
            .where(
              and(
                eq(schema.storeProductVariants.organizationId, scope.organizationId),
                inArray(schema.storeProductVariants.id, variantIds),
              ),
            )
            // Siempre en el mismo orden: dos pedidos con las mismas tallas no se bloquean entre sí.
            .orderBy(asc(schema.storeProductVariants.id))
            .for("update", { of: schema.storeProductVariants });
          const byId = new Map(lines.map((l) => [l.variantId, l]));
          let total = 0;
          for (const item of input.items) {
            const line = byId.get(item.variantId);
            if (!line) return { outcome: "unknown_variant" };
            const sellable = beneficiary
              ? line.status === "active" &&
                (line.availableUntil === null || line.availableUntil >= today) &&
                audienceMatches(line, beneficiary)
              : line.status !== "archived";
            if (!sellable) return { outcome: "unavailable", product: line.productName };
            if (line.stock !== null && line.stock < item.quantity)
              return {
                outcome: "out_of_stock",
                product: line.productName,
                variant: line.label,
                left: line.stock,
              };
            total += line.priceCents * item.quantity;
          }
          for (const item of input.items) {
            const line = byId.get(item.variantId)!;
            if (line.stock === null) continue;
            await tx
              .update(schema.storeProductVariants)
              .set({ stock: sql`${schema.storeProductVariants.stock} - ${item.quantity}` })
              .where(eq(schema.storeProductVariants.id, item.variantId));
          }
          const next = await tx
            .select({ n: sql<number>`coalesce(max(${schema.storeOrders.number}), 0)::int + 1` })
            .from(schema.storeOrders)
            .where(eq(schema.storeOrders.organizationId, scope.organizationId));
          const number = Number(next[0]?.n ?? 1);
          let chargeId: string | null = null;
          if (total > 0) {
            const charge = await tx
              .insert(schema.feeCharges)
              .values({
                organizationId: scope.organizationId,
                personId: input.personId,
                concept: `Pedido ${storeOrderCode(number)} · Tienda`,
                amountCents: total,
                dueOn: plusDays(today, STORE_PAYMENT_DAYS),
                status: "pending",
                createdBy: options.placedBy,
              })
              .returning({ id: schema.feeCharges.id });
            chargeId = charge[0]!.id;
          }
          const order = await tx
            .insert(schema.storeOrders)
            .values({
              organizationId: scope.organizationId,
              number,
              personId: input.personId,
              placedBy: options.placedBy,
              channel: options.channel,
              status: "pending",
              totalCents: total,
              note: input.note ?? null,
              chargeId,
            })
            .returning({ id: schema.storeOrders.id });
          await tx.insert(schema.storeOrderItems).values(
            input.items.map((item) => {
              const line = byId.get(item.variantId)!;
              return {
                organizationId: scope.organizationId,
                orderId: order[0]!.id,
                productId: line.productId,
                variantId: line.variantId,
                productName: line.productName,
                variantLabel: line.label,
                unitPriceCents: line.priceCents,
                quantity: item.quantity,
              };
            }),
          );
          return { outcome: "created", id: order[0]!.id };
        });
        if (result.outcome !== "created") return result;
        const order = await orderById(scope, result.id);
        if (!order) throw new Error("El pedido recién creado no aparece.");
        return { outcome: "created", order };
      } catch (error) {
        // Dos pedidos a la vez en el mismo club pueden querer el mismo número: se repite.
        if (isUniqueViolation(error) && attempt < 4) continue;
        throw error;
      }
    }
  }

  /**
   * Cambia el estado. Anular devuelve el stock y anula el cargo si no se ha pagado nada; si ya se
   * cobró algo, el cargo se queda como está y se devuelve lo cobrado para que el club lo reembolse.
   */
  async function setOrderStatus(
    scope: OrgScope,
    id: string,
    status: StoreOrderStatus,
  ): Promise<
    | { outcome: "updated"; order: StoreOrderRecord; refundCents: number }
    | { outcome: "not_found" }
    | { outcome: "invalid_transition"; from: StoreOrderStatus }
  > {
    const result = await db().transaction(async (tx) => {
      const rows = await tx
        .select({
          status: schema.storeOrders.status,
          chargeId: schema.storeOrders.chargeId,
        })
        .from(schema.storeOrders)
        .where(
          and(
            eq(schema.storeOrders.organizationId, scope.organizationId),
            eq(schema.storeOrders.id, id),
          ),
        )
        .for("update");
      const current = rows[0];
      if (!current) return { outcome: "not_found" as const };
      const from = current.status as StoreOrderStatus;
      if (!canMoveOrder(from, status)) return { outcome: "invalid_transition" as const, from };
      await tx.update(schema.storeOrders).set({ status }).where(eq(schema.storeOrders.id, id));
      let refundCents = 0;
      if (status === "cancelled") {
        const items = await tx
          .select({
            variantId: schema.storeOrderItems.variantId,
            quantity: schema.storeOrderItems.quantity,
          })
          .from(schema.storeOrderItems)
          .where(
            and(
              eq(schema.storeOrderItems.organizationId, scope.organizationId),
              eq(schema.storeOrderItems.orderId, id),
            ),
          )
          // Mismo orden que al crear un pedido: sin interbloqueos entre una anulación y una compra.
          .orderBy(asc(schema.storeOrderItems.variantId));
        for (const item of items) {
          if (!item.variantId) continue;
          await tx
            .update(schema.storeProductVariants)
            .set({ stock: sql`${schema.storeProductVariants.stock} + ${item.quantity}` })
            .where(
              and(
                eq(schema.storeProductVariants.id, item.variantId),
                sql`${schema.storeProductVariants.stock} is not null`,
              ),
            );
        }
        if (current.chargeId) {
          const charge = await tx
            .select({ paidCents: schema.feeCharges.paidCents, status: schema.feeCharges.status })
            .from(schema.feeCharges)
            .where(eq(schema.feeCharges.id, current.chargeId))
            .for("update");
          const paid = charge[0]?.paidCents ?? 0;
          if (paid === 0 && charge[0]?.status !== "cancelled") {
            await tx
              .update(schema.feeCharges)
              .set({ status: "cancelled" })
              .where(eq(schema.feeCharges.id, current.chargeId));
          }
          refundCents = paid;
        }
      }
      return { outcome: "updated" as const, refundCents };
    });
    if (result.outcome !== "updated") return result;
    const order = await orderById(scope, id);
    if (!order) return { outcome: "not_found" };
    return { outcome: "updated", order, refundCents: result.refundCents };
  }

  return {
    products: {
      async list(scope: OrgScope): Promise<StoreProductRecord[]> {
        return toProductRecords(scope, await productRows(scope));
      },

      byId: productById,

      async create(
        scope: OrgScope,
        input: StoreProductCreate,
        createdBy: string | null,
      ): Promise<
        | { outcome: "created"; product: StoreProductRecord }
        | { outcome: "unknown_section" }
        | { outcome: "unknown_team" }
      > {
        const audience = await audienceValid(scope, input);
        if (audience !== "ok") return { outcome: audience };
        const id = await db().transaction(async (tx) => {
          const rows = await tx
            .insert(schema.storeProducts)
            .values({
              organizationId: scope.organizationId,
              name: input.name,
              description: input.description ?? null,
              category: input.category,
              priceCents: input.priceCents,
              status: input.status,
              visibility: input.visibility,
              sectionId: input.sectionId ?? null,
              teamId: input.teamId ?? null,
              availableUntil: input.availableUntil ?? null,
              createdBy,
            })
            .returning({ id: schema.storeProducts.id });
          const productId = rows[0]!.id;
          await replaceVariants(
            tx,
            scope,
            productId,
            input.variants.map(({ label, stock }) => ({ label, stock })),
          );
          return productId;
        });
        const product = await productById(scope, id);
        if (!product) throw new Error("El producto recién creado no aparece.");
        return { outcome: "created", product };
      },

      async update(
        scope: OrgScope,
        id: string,
        patch: StoreProductUpdate,
      ): Promise<
        | { outcome: "updated"; product: StoreProductRecord }
        | { outcome: "not_found" }
        | { outcome: "unknown_section" }
        | { outcome: "unknown_team" }
        | { outcome: "unknown_variant" }
      > {
        const current = await productById(scope, id);
        if (!current) return { outcome: "not_found" };
        const audience = await audienceValid(scope, patch);
        if (audience !== "ok") return { outcome: audience };
        const values: Partial<typeof schema.storeProducts.$inferInsert> = {};
        if (patch.name !== undefined) values.name = patch.name;
        if (patch.description !== undefined) values.description = patch.description;
        if (patch.category !== undefined) values.category = patch.category;
        if (patch.priceCents !== undefined) values.priceCents = patch.priceCents;
        if (patch.status !== undefined) values.status = patch.status;
        if (patch.visibility !== undefined) values.visibility = patch.visibility;
        if (patch.availableUntil !== undefined) values.availableUntil = patch.availableUntil;
        // Sección y equipo se excluyen: poner uno quita el otro.
        if (patch.sectionId !== undefined) {
          values.sectionId = patch.sectionId;
          if (patch.sectionId) values.teamId = null;
        }
        if (patch.teamId !== undefined) {
          values.teamId = patch.teamId;
          if (patch.teamId) values.sectionId = null;
        }
        const known = new Set(current.variants.map((v) => v.id));
        if (patch.variants?.some((v) => v.id && !known.has(v.id)))
          return { outcome: "unknown_variant" };
        await db().transaction(async (tx) => {
          if (Object.keys(values).length > 0) {
            await tx
              .update(schema.storeProducts)
              .set(values)
              .where(
                and(
                  eq(schema.storeProducts.organizationId, scope.organizationId),
                  eq(schema.storeProducts.id, id),
                ),
              );
          }
          if (patch.variants) await replaceVariants(tx, scope, id, patch.variants);
        });
        const product = await productById(scope, id);
        return product ? { outcome: "updated", product } : { outcome: "not_found" };
      },

      async readImage(productId: string) {
        if (!/^[0-9a-f-]{36}$/i.test(productId)) return null;
        const rows = await db()
          .select({ key: schema.storeProducts.imageBlobKey })
          .from(schema.storeProducts)
          .where(eq(schema.storeProducts.id, productId))
          .limit(1);
        const key = rows[0]?.key;
        if (!key) return null;
        const blob = await images.get(key);
        return blob ? { key, ...blob } : null;
      },

      /** Guarda una foto nueva y la activa. La anterior se borra solo en producción (ADR 0024). */
      async uploadImage(
        scope: OrgScope,
        productId: string,
        body: ArrayBuffer,
        contentType: string,
        options: { cleanup: boolean },
      ): Promise<string | null> {
        const current = await db()
          .select({ key: schema.storeProducts.imageBlobKey })
          .from(schema.storeProducts)
          .where(
            and(
              eq(schema.storeProducts.organizationId, scope.organizationId),
              eq(schema.storeProducts.id, productId),
            ),
          )
          .limit(1);
        if (!current[0]) return null;
        const key = `${scope.organizationId}/${productId}/${randomUUID()}`;
        await images.set(key, body, contentType);
        await db()
          .update(schema.storeProducts)
          .set({ imageBlobKey: key })
          .where(
            and(
              eq(schema.storeProducts.organizationId, scope.organizationId),
              eq(schema.storeProducts.id, productId),
            ),
          );
        const previous = current[0].key;
        if (previous && options.cleanup) await images.delete(previous).catch(() => undefined);
        return key;
      },

      async removeImage(
        scope: OrgScope,
        productId: string,
        options: { cleanup: boolean },
      ): Promise<boolean> {
        const current = await db()
          .select({ key: schema.storeProducts.imageBlobKey })
          .from(schema.storeProducts)
          .where(
            and(
              eq(schema.storeProducts.organizationId, scope.organizationId),
              eq(schema.storeProducts.id, productId),
            ),
          )
          .limit(1);
        const previous = current[0]?.key;
        if (!previous) return false;
        await db()
          .update(schema.storeProducts)
          .set({ imageBlobKey: null })
          .where(
            and(
              eq(schema.storeProducts.organizationId, scope.organizationId),
              eq(schema.storeProducts.id, productId),
            ),
          );
        if (options.cleanup) await images.delete(previous).catch(() => undefined);
        return true;
      },
    },

    beneficiariesFor,

    /** Lo que esta cuenta puede comprar hoy y para quién de los suyos. */
    async catalog(
      scope: OrgScope,
      beneficiaries: StoreBeneficiaryRecord[],
    ): Promise<{ product: StoreProductRecord; beneficiaryIds: string[] }[]> {
      if (beneficiaries.length === 0) return [];
      const rows = await db()
        .select({
          product: schema.storeProducts,
          sectionName: schema.sections.name,
          teamName: schema.teams.name,
        })
        .from(schema.storeProducts)
        .leftJoin(schema.sections, eq(schema.sections.id, schema.storeProducts.sectionId))
        .leftJoin(schema.teams, eq(schema.teams.id, schema.storeProducts.teamId))
        .where(and(eq(schema.storeProducts.organizationId, scope.organizationId), onSale()))
        .orderBy(asc(schema.storeProducts.category), asc(schema.storeProducts.name));
      const visible = rows
        .map((row) => ({
          row,
          beneficiaryIds: beneficiaries
            .filter((b) => audienceMatches(row.product, b))
            .map((b) => b.personId),
        }))
        .filter((r) => r.beneficiaryIds.length > 0);
      const records = await toProductRecords(
        scope,
        visible.map((v) => v.row),
      );
      return records.map((product, i) => ({ product, beneficiaryIds: visible[i]!.beneficiaryIds }));
    },

    /** Si una cuenta tiene tienda: alguien para quien comprar y algo a la venta para esa persona. */
    async canShop(scope: OrgScope, userId: string): Promise<boolean> {
      const beneficiaries = await beneficiariesFor(scope, userId);
      if (beneficiaries.length === 0) return false;
      const rows = await db()
        .select({
          sectionId: schema.storeProducts.sectionId,
          teamId: schema.storeProducts.teamId,
        })
        .from(schema.storeProducts)
        .where(and(eq(schema.storeProducts.organizationId, scope.organizationId), onSale()));
      return rows.some((p) => beneficiaries.some((b) => audienceMatches(p, b)));
    },

    /** Catálogo público de la web del club: activo, a la venta y marcado como público. */
    async publicCatalog(scope: OrgScope, productId?: string): Promise<StoreProductRecord[]> {
      const rows = await db()
        .select({
          product: schema.storeProducts,
          sectionName: schema.sections.name,
          teamName: schema.teams.name,
        })
        .from(schema.storeProducts)
        .leftJoin(schema.sections, eq(schema.sections.id, schema.storeProducts.sectionId))
        .leftJoin(schema.teams, eq(schema.teams.id, schema.storeProducts.teamId))
        .where(
          and(
            eq(schema.storeProducts.organizationId, scope.organizationId),
            eq(schema.storeProducts.visibility, "public"),
            onSale(),
            ...(productId ? [eq(schema.storeProducts.id, productId)] : []),
          ),
        )
        .orderBy(asc(schema.storeProducts.category), asc(schema.storeProducts.name));
      return toProductRecords(scope, rows);
    },

    orders: {
      async list(scope: OrgScope, filter: StoreOrderFilter = {}): Promise<StoreOrderRecord[]> {
        await markOverdue(scope);
        const rows = await orderQuery()
          .where(
            and(
              eq(schema.storeOrders.organizationId, scope.organizationId),
              ...(filter.status ? [eq(schema.storeOrders.status, filter.status)] : []),
              ...(filter.personId ? [eq(schema.storeOrders.personId, filter.personId)] : []),
            ),
          )
          .orderBy(desc(schema.storeOrders.number))
          .limit(500);
        return toOrderRecords(scope, rows);
      },

      byId: orderById,

      /** Los pedidos de una cuenta: los que ha hecho y los de su persona y los suyos. */
      async forUser(scope: OrgScope, userId: string): Promise<StoreOrderRecord[]> {
        await markOverdue(scope);
        const personIds = await personIdsForUser(scope, userId);
        const rows = await orderQuery()
          .where(
            and(
              eq(schema.storeOrders.organizationId, scope.organizationId),
              or(
                eq(schema.storeOrders.placedBy, userId),
                ...(personIds.length > 0 ? [inArray(schema.storeOrders.personId, personIds)] : []),
              ),
            ),
          )
          .orderBy(desc(schema.storeOrders.number))
          .limit(200);
        return toOrderRecords(scope, rows);
      },

      async belongsToUser(scope: OrgScope, orderId: string, userId: string): Promise<boolean> {
        const order = await orderById(scope, orderId);
        if (!order) return false;
        if (order.placedBy?.userId === userId) return true;
        return (await personIdsForUser(scope, userId)).includes(order.person.id);
      },

      create: createOrder,
      setStatus: setOrderStatus,
    },

    /** Avisos del inicio: pedidos sin preparar y opciones agotadas de productos a la venta. */
    async alerts(
      scope: OrgScope,
    ): Promise<{ ordersToPrepare: number; variantsOutOfStock: number }> {
      const [orders, variants] = await Promise.all([
        db()
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.storeOrders)
          .where(
            and(
              eq(schema.storeOrders.organizationId, scope.organizationId),
              eq(schema.storeOrders.status, "pending"),
            ),
          ),
        db()
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.storeProductVariants)
          .innerJoin(
            schema.storeProducts,
            eq(schema.storeProducts.id, schema.storeProductVariants.productId),
          )
          .where(
            and(
              eq(schema.storeProductVariants.organizationId, scope.organizationId),
              eq(schema.storeProductVariants.stock, 0),
              onSale(),
            ),
          ),
      ]);
      return {
        ordersToPrepare: Number(orders[0]?.n ?? 0),
        variantsOutOfStock: Number(variants[0]?.n ?? 0),
      };
    },

    /** Personas del club para un pedido de mostrador. */
    async people(scope: OrgScope, query: string) {
      const q = query.trim();
      if (q.length < 2) return [];
      const pattern = `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      return db()
        .select({
          id: schema.people.id,
          firstName: schema.people.firstName,
          lastName: schema.people.lastName,
          email: schema.people.email,
        })
        .from(schema.people)
        .where(
          and(
            eq(schema.people.organizationId, scope.organizationId),
            or(
              sql`${schema.people.firstName} || ' ' || ${schema.people.lastName} ilike ${pattern}`,
              sql`${schema.people.email} ilike ${pattern}`,
            ),
          ),
        )
        .orderBy(asc(schema.people.lastName), asc(schema.people.firstName))
        .limit(20);
    },

    // --- Clave publicable del catálogo ---

    publicKey: {
      async of(scope: OrgScope): Promise<string | null> {
        const rows = await db()
          .select({ key: schema.organizations.publicApiKey })
          .from(schema.organizations)
          .where(eq(schema.organizations.id, scope.organizationId))
          .limit(1);
        return rows[0]?.key ?? null;
      },

      /** Clave nueva: la anterior deja de funcionar al momento. */
      async rotate(scope: OrgScope): Promise<string> {
        const key = `pk_${randomBytes(16).toString("hex")}`;
        await db()
          .update(schema.organizations)
          .set({ publicApiKey: key })
          .where(eq(schema.organizations.id, scope.organizationId));
        return key;
      },

      async disable(scope: OrgScope): Promise<void> {
        await db()
          .update(schema.organizations)
          .set({ publicApiKey: null })
          .where(eq(schema.organizations.id, scope.organizationId));
      },

      /** El club de una clave. La petición pública llega sin club: la clave lo dice. */
      async resolve(key: string): Promise<{ slug: string } | null> {
        const rows = await db()
          .select({ id: schema.organizations.id, slug: schema.organizations.slug })
          .from(schema.organizations)
          .where(eq(schema.organizations.publicApiKey, key))
          .limit(1);
        return rows[0] ? { slug: rows[0].slug } : null;
      },
    },
  };
}
