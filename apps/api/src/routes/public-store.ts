import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  PUBLIC_KEY_HEADER,
  PUBLIC_KEY_PATTERN,
  PUBLIC_KEY_QUERY,
  PublicCatalogProductResponseSchema,
  PublicCatalogResponseSchema,
  type PublicCatalogProduct,
} from "@sportsmanager/shared";
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { ApiConfig } from "../config.ts";
import {
  logoUrlFor,
  storeImageUrlFor,
  type DataLayer,
  type OrganizationRow,
  type StoreProductRecord,
} from "../data/index.ts";
import type { AppEnv } from "../http/context.ts";
import { ApiError, forbidden, notFound } from "../http/errors.ts";
import { absoluteApiUrl, organizationUrl } from "../tenancy.ts";
import { inStock } from "./store.ts";

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiErrorSchema } },
});
const json = <T extends z.ZodTypeAny>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const keyQuery = z.object({
  key: z
    .string()
    .optional()
    .openapi({
      description: `Clave publicable del club (\`pk_…\`). También vale en la cabecera \`${PUBLIC_KEY_HEADER}\`.`,
    }),
});

/**
 * API pública del catálogo (ADR 0041): la web del club enseña los productos que el club marca como
 * públicos en su tienda. Solo lectura y sin sesión. La clave publicable identifica al club (va en
 * el código de su web, como la de Stripe); sin clave o con una apagada, 401. CORS abierto: los
 * datos son públicos y la clave no da acceso a nada más. Comprar sigue siendo en la app.
 */
export function createPublicStoreRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  app.use(
    "/api/public/*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: [PUBLIC_KEY_HEADER, "content-type"],
      maxAge: 86_400,
    }),
  );

  /** La clave dice el club: la cabecera o, para incrustar sin código, la query. */
  const resolveKey: MiddlewareHandler<AppEnv> = async (c, next) => {
    const key = (c.req.header(PUBLIC_KEY_HEADER) ?? c.req.query(PUBLIC_KEY_QUERY) ?? "").trim();
    if (!PUBLIC_KEY_PATTERN.test(key))
      throw new ApiError(401, "unauthorized", "Falta la clave pública del club o no es válida.");
    const found = await data.store.publicKey.resolve(key);
    const resolved = found ? await data.organizations.findBySlug(found.slug) : null;
    if (!resolved)
      throw new ApiError(401, "unauthorized", "Esa clave pública no existe o está apagada.");
    if (resolved.organization.status !== "active") throw forbidden("Este club no está activo.");
    c.set("tenant", {
      kind: "organization",
      organization: resolved.organization,
      scope: resolved.scope,
    });
    await next();
  };

  const tenantOf = (c: { get: (key: "tenant") => AppEnv["Variables"]["tenant"] }) => {
    const tenant = c.get("tenant");
    if (tenant.kind !== "organization") throw notFound();
    return tenant;
  };

  function urls(host: string | undefined, deploy: string | undefined) {
    return {
      api: (path: string) => absoluteApiUrl(path, config, host, deploy),
      club: (slug: string) => organizationUrl(slug, config, host, deploy),
    };
  }

  function clubDto(org: OrganizationRow, u: ReturnType<typeof urls>) {
    const logo = logoUrlFor(org.logoBlobKey, org.slug);
    return {
      slug: org.slug,
      name: org.name,
      logoUrl: logo ? u.api(logo) : null,
      primaryColor: org.brandPrimaryColor,
      secondaryColor: org.brandSecondaryColor,
      storeUrl: `${u.club(org.slug)}/store`,
    };
  }

  function productDto(
    product: StoreProductRecord,
    org: OrganizationRow,
    u: ReturnType<typeof urls>,
  ): PublicCatalogProduct {
    const image = storeImageUrlFor(product.imageBlobKey, product.id);
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      priceCents: product.priceCents,
      currency: "EUR",
      imageUrl: image ? u.api(image) : null,
      availableUntil: product.availableUntil,
      inStock: product.variants.some((v) => inStock(v.stock)),
      options: product.variants.map((v) => ({
        id: v.id,
        label: v.label,
        inStock: inStock(v.stock),
      })),
      buyUrl: `${u.club(org.slug)}/store?product=${product.id}`,
    };
  }

  /** Un minuto de caché: la web del club no castiga la función en cada visita. */
  const cacheHeaders = { "cache-control": "public, max-age=60", vary: PUBLIC_KEY_HEADER };

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/public/v1/catalog",
      tags: ["API pública"],
      summary:
        "Catálogo público del club: los productos activos que el club marca como públicos, con precio, foto, disponibilidad y enlace para comprar en la app",
      middleware: [resolveKey],
      request: { query: keyQuery },
      responses: {
        200: json("Catálogo", PublicCatalogResponseSchema),
        401: error("Sin clave o clave apagada"),
        403: error("Club no activo"),
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const u = urls(c.req.header("host"), c.env?.context?.deploy?.context);
      const products = await data.store.publicCatalog(tenant.scope);
      return c.json(
        {
          club: clubDto(tenant.organization, u),
          products: products.map((p) => productDto(p, tenant.organization, u)),
        },
        200,
        cacheHeaders,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/public/v1/catalog/products/{id}",
      tags: ["API pública"],
      summary: "Un producto del catálogo público",
      middleware: [resolveKey],
      request: { params: z.object({ id: z.string().uuid() }), query: keyQuery },
      responses: {
        200: json("Producto", PublicCatalogProductResponseSchema),
        401: error("Sin clave o clave apagada"),
        404: error("El producto no existe o no es público"),
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { id } = c.req.valid("param");
      const u = urls(c.req.header("host"), c.env?.context?.deploy?.context);
      const product = (await data.store.publicCatalog(tenant.scope, id))[0];
      if (!product) throw notFound("Ese producto no existe o no está en el catálogo público.");
      return c.json(
        {
          club: clubDto(tenant.organization, u),
          product: productDto(product, tenant.organization, u),
        },
        200,
        cacheHeaders,
      );
    },
  );

  return app;
}
