-- Tienda del club (ADR 0041). El club demo llega con una tienda para verla sin picar datos:
--   - Ropa con tallas y stock (camiseta, pantalón de entreno, sudadera con una talla agotada y otra
--     con pocas unidades), una botella, la cena de fin de temporada solo para el Alevín A, una
--     salida para todo el club y una mochila en borrador.
--   - La camiseta, el pantalón, la sudadera y la botella salen también en el catálogo público.
--   - Tres pedidos: el de Clara Martí (familia@demo.test) listo para recoger y por pagar, el de
--     Miguel Lozano (jugador@demo.test) entregado y pagado, y uno de mostrador recién recibido.
-- Idempotente: cada inserción salta si ya existe.

INSERT INTO "store_products" ("organization_id", "name", "description", "category", "price_cents", "status", "visibility", "team_id", "available_until")
SELECT o."id", v."name", v."description", v."category", v."price", v."status", v."visibility",
  (SELECT t."id" FROM "teams" t WHERE t."organization_id" = o."id" AND t."name" = v."team" LIMIT 1),
  CASE WHEN v."until_days" IS NULL THEN NULL ELSE CURRENT_DATE + v."until_days" END
FROM "organizations" o
CROSS JOIN (VALUES
  ('Camiseta oficial de juego', 'La camiseta de partido de esta temporada, con el escudo bordado. Indica en la nota el nombre y el dorsal si los quieres estampados.', 'apparel', 3500, 'active', 'public', NULL, NULL),
  ('Pantalón de entreno', 'Pantalón corto técnico para entrenar, transpirable y con bolsillos.', 'apparel', 2200, 'active', 'public', NULL, NULL),
  ('Sudadera del club', 'Sudadera con capucha y el escudo en el pecho. Para el frío de los partidos de fuera.', 'apparel', 3900, 'active', 'public', NULL, NULL),
  ('Botella del club', 'Botella reutilizable de 750 ml, sin BPA.', 'equipment', 800, 'active', 'public', NULL, NULL),
  ('Cena de fin de temporada del Alevín A', 'Cena con jugadoras, familias y cuerpo técnico. Una entrada por persona que viene. Indica alergias en la nota.', 'event', 2500, 'active', 'members', 'Alevín A', 60),
  ('Salida al parque de aventura', 'Excursión de un día para deportistas del club. Incluye autocar, entrada y comida.', 'trip', 4500, 'active', 'members', NULL, 45),
  ('Mochila del club', 'Mochila con compartimento para las zapatillas.', 'equipment', 3200, 'draft', 'members', NULL, NULL)
) AS v("name", "description", "category", "price", "status", "visibility", "team", "until_days")
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "store_products" p WHERE p."organization_id" = o."id" AND p."name" = v."name");

INSERT INTO "store_product_variants" ("organization_id", "product_id", "label", "stock", "sort_order")
SELECT p."organization_id", p."id", v."label", v."stock", v."sort"
FROM "store_products" p
JOIN "organizations" o ON o."id" = p."organization_id" AND o."slug" = 'demo'
JOIN (VALUES
  ('Camiseta oficial de juego', '8 años', 6, 10),
  ('Camiseta oficial de juego', '10 años', 3, 20),
  ('Camiseta oficial de juego', '12 años', 9, 30),
  ('Camiseta oficial de juego', '14 años', 8, 40),
  ('Camiseta oficial de juego', 'S', 10, 50),
  ('Camiseta oficial de juego', 'M', 12, 60),
  ('Camiseta oficial de juego', 'L', 4, 70),
  ('Camiseta oficial de juego', 'XL', 6, 80),
  ('Pantalón de entreno', '8 años', 10, 10),
  ('Pantalón de entreno', '10 años', 11, 20),
  ('Pantalón de entreno', '12 años', 12, 30),
  ('Pantalón de entreno', 'S', 8, 40),
  ('Pantalón de entreno', 'M', 8, 50),
  ('Pantalón de entreno', 'L', 6, 60),
  ('Sudadera del club', 'S', 0, 10),
  ('Sudadera del club', 'M', 2, 20),
  ('Sudadera del club', 'L', 7, 30),
  ('Botella del club', NULL, 40, 10),
  ('Cena de fin de temporada del Alevín A', NULL, 60, 10),
  ('Salida al parque de aventura', NULL, 50, 10),
  ('Mochila del club', NULL, 20, 10)
) AS v("product", "label", "stock", "sort") ON v."product" = p."name"
WHERE NOT EXISTS (
  SELECT 1 FROM "store_product_variants" x
  WHERE x."product_id" = p."id" AND x."label" IS NOT DISTINCT FROM v."label"
);

-- Los cargos con los que se cobran los pedidos (uno por pedido con importe).
INSERT INTO "fee_charges" ("organization_id", "person_id", "concept", "amount_cents", "due_on", "status")
SELECT o."id", x."id", v."concept", v."amount", CURRENT_DATE + v."due_days", 'pending'
FROM "organizations" o
JOIN (VALUES
  ('Clara', 'Martí', 'Pedido T-0001 · Tienda', 5700, 5),
  ('Miguel', 'Lozano', 'Pedido T-0002 · Tienda', 3900, -3),
  ('Àlex', 'Moreno', 'Pedido T-0003 · Tienda', 2500, 7)
) AS v("first_name", "last_name", "concept", "amount", "due_days") ON true
JOIN "people" x ON x."organization_id" = o."id" AND x."first_name" = v."first_name" AND x."last_name" = v."last_name"
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "fee_charges" c WHERE c."organization_id" = o."id" AND c."concept" = v."concept");

-- El pedido de Miguel se pagó en el club, en efectivo.
INSERT INTO "payments" ("organization_id", "charge_id", "amount_cents", "method", "paid_on", "note")
SELECT c."organization_id", c."id", c."amount_cents", 'cash', CURRENT_DATE - 3, 'Pagado al recoger'
FROM "fee_charges" c
JOIN "organizations" o ON o."id" = c."organization_id" AND o."slug" = 'demo'
WHERE c."concept" = 'Pedido T-0002 · Tienda'
  AND NOT EXISTS (SELECT 1 FROM "payments" p WHERE p."charge_id" = c."id");

UPDATE "fee_charges" c
SET "paid_cents" = c."amount_cents", "status" = 'paid'
FROM "organizations" o
WHERE o."slug" = 'demo' AND c."organization_id" = o."id" AND c."concept" = 'Pedido T-0002 · Tienda' AND c."status" <> 'paid';

INSERT INTO "store_orders" ("organization_id", "number", "person_id", "placed_by", "channel", "status", "total_cents", "note", "charge_id", "created_at")
SELECT o."id", v."number", x."id",
  (SELECT u."id" FROM "users" u WHERE u."email" = v."placed_by"),
  v."channel", v."status", v."total", v."note",
  (SELECT c."id" FROM "fee_charges" c WHERE c."organization_id" = o."id" AND c."concept" = v."concept" LIMIT 1),
  now() - v."days_ago" * INTERVAL '1 day'
FROM "organizations" o
JOIN (VALUES
  (1, 'Clara', 'Martí', 'familia@demo.test', 'app', 'ready', 5700, 'Dorsal 1 y CLARA en la espalda, por favor.', 'Pedido T-0001 · Tienda', 2),
  (2, 'Miguel', 'Lozano', 'jugador@demo.test', 'app', 'delivered', 3900, NULL, 'Pedido T-0002 · Tienda', 6),
  (3, 'Àlex', 'Moreno', 'admin@demo.test', 'counter', 'pending', 2500, 'Sin gluten.', 'Pedido T-0003 · Tienda', 0)
) AS v("number", "first_name", "last_name", "placed_by", "channel", "status", "total", "note", "concept", "days_ago") ON true
JOIN "people" x ON x."organization_id" = o."id" AND x."first_name" = v."first_name" AND x."last_name" = v."last_name"
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "store_orders" s WHERE s."organization_id" = o."id" AND s."number" = v."number");

INSERT INTO "store_order_items" ("organization_id", "order_id", "product_id", "variant_id", "product_name", "variant_label", "unit_price_cents", "quantity")
SELECT s."organization_id", s."id", p."id", va."id", p."name", va."label", p."price_cents", v."quantity"
FROM "store_orders" s
JOIN "organizations" o ON o."id" = s."organization_id" AND o."slug" = 'demo'
JOIN (VALUES
  (1, 'Camiseta oficial de juego', '10 años', 1),
  (1, 'Pantalón de entreno', '10 años', 1),
  (2, 'Sudadera del club', 'L', 1),
  (3, 'Cena de fin de temporada del Alevín A', NULL, 1)
) AS v("number", "product", "label", "quantity") ON v."number" = s."number"
JOIN "store_products" p ON p."organization_id" = s."organization_id" AND p."name" = v."product"
JOIN "store_product_variants" va ON va."product_id" = p."id" AND va."label" IS NOT DISTINCT FROM v."label"
WHERE NOT EXISTS (
  SELECT 1 FROM "store_order_items" i WHERE i."order_id" = s."id" AND i."product_id" = p."id"
);
