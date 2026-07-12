import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  __linePg?: ReturnType<typeof postgres>;
};

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Do not throw at import time (breaks `next build` tracing). The connection
    // is lazy; real queries will fail loudly at runtime if this is wrong.
    console.warn(
      "[db] DATABASE_URL is not set; using a non-functional placeholder.",
    );
    return "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";
  }
  return url;
}

/**
 * Reuse a single postgres client across hot reloads / module instances to avoid
 * exhausting connections in development.
 */
export const queryClient =
  globalForDb.__linePg ??
  postgres(getConnectionString(), {
    max: Number(process.env.PG_POOL_MAX ?? 10),
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__linePg = queryClient;
}

export const db = drizzle(queryClient, { schema, casing: "snake_case" });

export type Database = typeof db;
