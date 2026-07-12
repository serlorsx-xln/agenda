import { defineConfig } from "drizzle-kit";

const url =
  process.env.DATABASE_URL ??
  "postgres://knip:knip@127.0.0.1:5432/knip";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
