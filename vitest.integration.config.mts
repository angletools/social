import { defineConfig } from "vitest/config";
import path from "node:path";
if (!process.env.DATABASE_URL || !/^\/rasd_test_[a-z0-9_]+$/.test(new URL(process.env.DATABASE_URL).pathname)) {
  throw new Error("Integration tests require a dedicated DATABASE_URL named rasd_test_*. Never use a production or demo database.");
}
export default defineConfig({
  resolve: { alias: {
    "@": path.resolve(import.meta.dirname, "src"),
    "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
    "next/cache": path.resolve(import.meta.dirname, "tests/support/next.ts"),
    "next/headers": path.resolve(import.meta.dirname, "tests/support/next.ts"),
    "next/navigation": path.resolve(import.meta.dirname, "tests/support/next.ts"),
  } },
  test: { include: ["tests/integration/**/*.test.ts"], fileParallelism: false, testTimeout: 20_000, hookTimeout: 20_000 },
});
