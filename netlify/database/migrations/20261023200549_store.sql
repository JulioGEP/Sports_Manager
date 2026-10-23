CREATE TABLE "store_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"variant_id" uuid,
	"product_name" text NOT NULL,
	"variant_label" text,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_order_items_quantity_check" CHECK ("store_order_items"."quantity" >= 1),
	CONSTRAINT "store_order_items_price_check" CHECK ("store_order_items"."unit_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "store_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"person_id" uuid NOT NULL,
	"placed_by" uuid,
	"channel" text DEFAULT 'app' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_cents" integer NOT NULL,
	"note" text,
	"charge_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_orders_status_check" CHECK ("store_orders"."status" in ('pending', 'ready', 'delivered', 'cancelled')),
	CONSTRAINT "store_orders_channel_check" CHECK ("store_orders"."channel" in ('app', 'counter')),
	CONSTRAINT "store_orders_total_check" CHECK ("store_orders"."total_cents" >= 0),
	CONSTRAINT "store_orders_number_check" CHECK ("store_orders"."number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "store_product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"label" text,
	"stock" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_product_variants_stock_check" CHECK ("store_product_variants"."stock" is null or "store_product_variants"."stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "store_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"price_cents" integer NOT NULL,
	"image_blob_key" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'members' NOT NULL,
	"section_id" uuid,
	"team_id" uuid,
	"available_until" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_products_category_check" CHECK ("store_products"."category" in ('apparel', 'equipment', 'event', 'trip', 'other')),
	CONSTRAINT "store_products_status_check" CHECK ("store_products"."status" in ('draft', 'active', 'archived')),
	CONSTRAINT "store_products_visibility_check" CHECK ("store_products"."visibility" in ('members', 'public')),
	CONSTRAINT "store_products_price_check" CHECK ("store_products"."price_cents" >= 0),
	CONSTRAINT "store_products_audience_check" CHECK ("store_products"."section_id" is null or "store_products"."team_id" is null)
);
--> statement-breakpoint
ALTER TABLE "access_rules" DROP CONSTRAINT "access_rules_area_check";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "public_api_key" text;--> statement-breakpoint
ALTER TABLE "store_order_items" ADD CONSTRAINT "store_order_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_order_items" ADD CONSTRAINT "store_order_items_order_id_store_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."store_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_order_items" ADD CONSTRAINT "store_order_items_product_id_store_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."store_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_order_items" ADD CONSTRAINT "store_order_items_variant_id_store_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."store_product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_orders" ADD CONSTRAINT "store_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_orders" ADD CONSTRAINT "store_orders_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_orders" ADD CONSTRAINT "store_orders_placed_by_users_id_fk" FOREIGN KEY ("placed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_orders" ADD CONSTRAINT "store_orders_charge_id_fee_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."fee_charges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_product_variants" ADD CONSTRAINT "store_product_variants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_product_variants" ADD CONSTRAINT "store_product_variants_product_id_store_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."store_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_order_items_organization_id_idx" ON "store_order_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "store_order_items_order_id_idx" ON "store_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "store_order_items_variant_id_idx" ON "store_order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_orders_org_number_unique" ON "store_orders" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "store_orders_organization_id_idx" ON "store_orders" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "store_orders_person_id_idx" ON "store_orders" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "store_orders_charge_id_idx" ON "store_orders" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "store_product_variants_organization_id_idx" ON "store_product_variants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "store_product_variants_product_id_idx" ON "store_product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "store_products_organization_id_idx" ON "store_products" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "store_products_org_status_idx" ON "store_products" USING btree ("organization_id","status");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_public_api_key_unique" UNIQUE("public_api_key");--> statement-breakpoint
ALTER TABLE "access_rules" ADD CONSTRAINT "access_rules_area_check" CHECK ("access_rules"."area" in ('sections', 'players', 'club_members', 'staff', 'agenda', 'facilities', 'challenges', 'training', 'health', 'fees', 'store', 'activity'));