"""
Cenário E2E: fluxo completo de "Manifestar interesse".

Passos:
  1. Marina (inquilino) faz login e descobrimos o id da pré-aprovação dela
     (share_as_lead=true) via supabase client no browser.
  2. Rafael (agente) faz login, vai em /leads, chama agent_signal_interest
     para o lead da Marina (garante que a notificação vai pra ela e não pra
     outro inquilino do seed).
  3. Marina reabre a sessão, abre o sino de notificações no dashboard e
     confirma que a notificação "Um agente demonstrou interesse" apareceu
     com link para /agents/<rafael_id>.
  4. Clica no link e confirma que o perfil público do Rafael carrega.

Uso:
    python3 tests/e2e/manifestar_interesse.py
"""

import asyncio
import json
import sys
import urllib.request
from pathlib import Path
from playwright.async_api import async_playwright, Page

BASE = "http://localhost:8080"
PASSWORD = "TestPass!2026"
OUT = Path("/tmp/browser/e2e/manifestar_interesse")
OUT.mkdir(parents=True, exist_ok=True)

MARINA_ID = "22222222-2222-2222-2222-222222222222"
RAFAEL_ID = "33333333-3333-3333-3333-333333333333"


def reset(user_id: str) -> str:
    req = urllib.request.Request(
        f"{BASE}/api/public/dev-test-session",
        data=json.dumps({"user_id": user_id, "password": PASSWORD}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())["email"]


async def login(page: Page, email: str) -> None:
    await page.goto(f"{BASE}/auth", wait_until="domcontentloaded")
    await page.wait_for_selector("#login-email", timeout=15000)
    res = await page.evaluate(
        """async ({ email, password }) => {
            const mod = await import('/src/integrations/supabase/client.ts');
            const { error, data } = await mod.supabase.auth.signInWithPassword({ email, password });
            return { error: error?.message ?? null, hasSession: !!data.session };
        }""",
        {"email": email, "password": PASSWORD},
    )
    if res.get("error") or not res.get("hasSession"):
        raise RuntimeError(f"login falhou ({email}): {res}")


async def snap(page: Page, name: str) -> None:
    await page.wait_for_timeout(400)
    await page.screenshot(path=str(OUT / f"{name}.png"))
    print(f"  📸 {name}.png  ← {page.url}")


async def main() -> None:
    marina_email = reset(MARINA_ID)
    rafael_email = reset(RAFAEL_ID)
    print(f"Marina={marina_email}  Rafael={rafael_email}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # -------- 1. Marina: pega o lead_id dela --------
        ctx_m = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page_m = await ctx_m.new_page()
        await login(page_m, marina_email)
        await page_m.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
        await snap(page_m, "01_marina_dashboard")

        # Garante que Marina tem uma pré-aprovação exposta como lead.
        lead_id = await page_m.evaluate(
            """async () => {
                const mod = await import('/src/integrations/supabase/client.ts');
                const { data: u } = await mod.supabase.auth.getUser();
                const uid = u.user.id;
                let { data: pa } = await mod.supabase
                  .from('tenant_preapprovals').select('id, share_as_lead')
                  .eq('user_id', uid).maybeSingle();
                if (!pa) {
                  const ins = await mod.supabase.from('tenant_preapprovals').insert({
                    user_id: uid, monthly_income: 12000, guarantee_type: 'fiador',
                    preferred_city: 'São Paulo', share_as_lead: true, status: 'approved',
                  }).select('id').single();
                  if (ins.error) return { id: null, error: ins.error.message };
                  return { id: ins.data.id, error: null };
                }
                if (!pa.share_as_lead) {
                  const up = await mod.supabase.from('tenant_preapprovals')
                    .update({ share_as_lead: true }).eq('id', pa.id);
                  if (up.error) return { id: null, error: up.error.message };
                }
                return { id: pa.id, error: null };
            }"""
        )
        print(f"  lead da Marina: {lead_id}")
        assert lead_id.get("id"), f"não consegui obter/criar preapproval da Marina: {lead_id}"

        # -------- 2. Rafael: manifesta interesse --------
        ctx_r = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page_r = await ctx_r.new_page()
        await login(page_r, rafael_email)
        await page_r.goto(f"{BASE}/leads", wait_until="domcontentloaded")
        await page_r.wait_for_selector("button:has-text('Manifestar interesse')", timeout=8000)
        await snap(page_r, "02_rafael_leads")

        signal = await page_r.evaluate(
            """async (leadId) => {
                const mod = await import('/src/integrations/supabase/client.ts');
                const { error } = await mod.supabase.rpc('agent_signal_interest', { _lead_id: leadId });
                return { error: error?.message ?? null };
            }""",
            lead_id["id"],
        )
        assert not signal.get("error"), f"agent_signal_interest falhou: {signal}"
        print("  ✅ Rafael manifestou interesse no lead da Marina")

        # -------- 3. Marina: confere notificação in-app --------
        # invalida cache do react-query pra forçar refetch
        await page_m.evaluate(
            """async () => {
                const mod = await import('/src/integrations/supabase/client.ts');
                const { data } = await mod.supabase
                  .from('notifications')
                  .select('id,title,url,kind')
                  .order('created_at', { ascending: false })
                  .limit(5);
                return data;
            }"""
        )
        # reload pra pegar contagem de não lidas atualizada
        await page_m.reload(wait_until="domcontentloaded")
        await page_m.wait_for_selector("button[aria-label='Notificações']", timeout=10000)
        await page_m.click("button[aria-label='Notificações']")
        await page_m.wait_for_selector("text=Um agente demonstrou interesse", timeout=8000)
        await snap(page_m, "03_marina_notif_open")

        # confere URL do link da notificação
        expected_href = f"/agents/{RAFAEL_ID}"
        link = page_m.locator(f"a[href='{expected_href}']").first
        await link.wait_for(timeout=5000)
        print(f"  ✅ notificação com link {expected_href}")

        # -------- 4. Clica e valida perfil público do Rafael --------
        await link.click()
        await page_m.wait_for_url(f"**/agents/{RAFAEL_ID}", timeout=8000)
        await page_m.wait_for_load_state("domcontentloaded")
        await snap(page_m, "04_marina_agent_profile")
        body = await page_m.inner_text("body")
        assert RAFAEL_ID in page_m.url, f"URL final inesperada: {page_m.url}"
        assert len(body) > 20, "perfil público veio vazio"
        print("  ✅ perfil público do Rafael carregou")

        await ctx_m.close()
        await ctx_r.close()
        await browser.close()

    print("\n🎉 Cenário 'Manifestar interesse' OK")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except AssertionError as e:
        print(f"❌ ASSERT falhou: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ erro: {e}")
        sys.exit(1)
