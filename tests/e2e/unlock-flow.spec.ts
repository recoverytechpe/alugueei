import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Fluxo coberto:
 *   1) Estado BLOQUEADO — endereço aproximado, botão "Desbloquear imóvel".
 *   2) Dialog de termos + LGPD (validação de checkboxes).
 *   3) Mock PAID — webhook MP não é chamado em E2E; injetamos a linha
 *      property_unlocks com status='paid' via service_role e revalidamos.
 *   4) Acesso liberado — badge "Desbloqueado", contagem regressiva.
 *   5) Expiração — setamos expires_at no passado e validamos banner
 *      "Renovar acesso".
 *
 * Pré-requisitos: ver playwright.config.ts.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const PROPERTY_ID = process.env.E2E_PROPERTY_ID!;
const TENANT_EMAIL = process.env.E2E_TENANT_EMAIL!;
const TENANT_PASSWORD = process.env.E2E_TENANT_PASSWORD!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test.skip(
  !PROPERTY_ID || !TENANT_EMAIL || !TENANT_PASSWORD || !SUPABASE_URL || !SERVICE_ROLE,
  "Variáveis E2E_* ou SUPABASE_* ausentes — pulando E2E de desbloqueio.",
);

let admin: SupabaseClient;
let tenantId: string;

test.beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw error;
  const u = data.users.find((x) => x.email?.toLowerCase() === TENANT_EMAIL.toLowerCase());
  if (!u) throw new Error(`Usuário de teste ${TENANT_EMAIL} não existe.`);
  tenantId = u.id;
});

test.beforeEach(async () => {
  await admin
    .from("property_unlocks")
    .delete()
    .eq("user_id", tenantId)
    .eq("property_id", PROPERTY_ID);
});

async function login(page: Page) {
  await page.goto("/auth");
  await page.getByLabel(/e-?mail/i).fill(TENANT_EMAIL);
  await page.getByLabel(/senha/i).fill(TENANT_PASSWORD);
  await page.getByRole("button", { name: /entrar|sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 15_000 });
}

async function goToProperty(page: Page) {
  await page.goto(`/properties/${PROPERTY_ID}`);
  await page.waitForLoadState("networkidle");
}

async function mockPaid(opts: { expiresInDays: number }) {
  const now = new Date();
  const expires = new Date(now.getTime() + opts.expiresInDays * 86_400_000);
  await admin.from("property_unlocks").upsert(
    {
      user_id: tenantId,
      property_id: PROPERTY_ID,
      status: "paid",
      amount_cents: 2990,
      terms_accepted_at: now.toISOString(),
      lgpd_accepted_at: now.toISOString(),
      paid_at: now.toISOString(),
      expires_at: expires.toISOString(),
    },
    { onConflict: "user_id,property_id" },
  );
}

test.describe("Fluxo de desbloqueio de imóvel", () => {
  test("1. estado bloqueado mostra endereço aproximado e CTA", async ({ page }) => {
    await login(page);
    await goToProperty(page);
    await expect(page.getByRole("button", { name: /desbloquear imóvel/i })).toBeVisible();
    await expect(page.getByText(/endereço exato.*disponíveis após o desbloqueio/i)).toBeVisible();
  });

  test("2. dialog exige termos + LGPD aceitos", async ({ page }) => {
    await login(page);
    await goToProperty(page);
    await page.getByRole("button", { name: /desbloquear imóvel/i }).click();
    const confirm = page.getByRole("button", { name: /confirmar desbloqueio/i });
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/termos de uso e a política anti-bypass/i).check();
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/autorizo o tratamento dos meus dados/i).check();
    await expect(confirm).toBeEnabled();
  });

  test("3 + 4. após paid (mock) o endereço é liberado", async ({ page }) => {
    await mockPaid({ expiresInDays: 30 });
    await login(page);
    await goToProperty(page);
    await expect(page.getByText(/desbloqueado.*expira em/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /desbloquear imóvel/i })).toHaveCount(0);
  });

  test("5. unlock expirado mostra banner Renovar acesso", async ({ page }) => {
    await mockPaid({ expiresInDays: -1 });
    await login(page);
    await goToProperty(page);
    await expect(page.getByText(/seu acesso.*expirou/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /renovar acesso · r\$ 29,90/i }),
    ).toBeVisible();
  });
});

test.afterAll(async () => {
  if (admin && tenantId) {
    await admin
      .from("property_unlocks")
      .delete()
      .eq("user_id", tenantId)
      .eq("property_id", PROPERTY_ID);
  }
});
