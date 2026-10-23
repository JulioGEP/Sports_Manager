ALTER TABLE "organizations" ADD COLUMN "style_typography" text DEFAULT 'moderna' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "style_buttons" text DEFAULT 'sistema' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "style_icons" text DEFAULT 'duotono' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "style_background" text DEFAULT 'liso' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "style_hero" text DEFAULT 'liso' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "style_nav" text DEFAULT 'claro' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "style_corners" text DEFAULT 'sistema' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "motto" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_style_typography_check" CHECK ("organizations"."style_typography" in ('moderna', 'clasica', 'deportiva', 'amable', 'geometrica'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_style_buttons_check" CHECK ("organizations"."style_buttons" in ('sistema', 'pildora', 'suave', 'recta', 'relieve'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_style_icons_check" CHECK ("organizations"."style_icons" in ('duotono', 'linea', 'fina', 'gruesa', 'relleno'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_style_background_check" CHECK ("organizations"."style_background" in ('liso', 'neutro', 'tenido', 'degradado', 'trama'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_style_hero_check" CHECK ("organizations"."style_hero" in ('liso', 'degradado', 'rayas', 'banda', 'escudo'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_style_nav_check" CHECK ("organizations"."style_nav" in ('claro', 'club', 'oscuro'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_style_corners_check" CHECK ("organizations"."style_corners" in ('sistema', 'redondeadas', 'rectas'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_motto_length" CHECK ("organizations"."motto" is null or char_length("organizations"."motto") between 1 and 80);