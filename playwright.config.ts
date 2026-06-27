import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config para E2E do fluxo de desbloqueio de imóveis.
 *
 * Como rodar (local):
 *   1) bun add -d @playwright/test && bunx playwright install chromium
 *   2) Definir no .env.test:
 *      E2E_BASE_URL=http://localhost:8080
 *      E2E_TENANT_EMAIL=...  E2E_TENANT_PASSWORD=...
 *      E2E_PROPERTY_ID=<uuid de um imóvel publicado>
 *      SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...   (apenas local; usado para mock paid + reset)
 *   3) bun run test:e2e
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
