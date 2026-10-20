import { defineConfig } from "drizzle-kit";

/**
 * Las migraciones se generan en el directorio que Netlify Database aplica en cada deploy
 * (preview antes de publicarla, producción justo antes de publicar). Nunca se aplican a mano
 * contra una base alojada. Ver ADR 0003 y docs/deploy.md.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "../../netlify/database/migrations",
  migrations: { prefix: "timestamp" },
  strict: true,
  verbose: true,
});
