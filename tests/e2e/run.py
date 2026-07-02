"""
Suíte Playwright que exercita o app como cada uma das 3 personas de teste.
Roda contra o dev server em http://localhost:8080.

Uso:
    python3 tests/e2e/run.py            # todas as personas
    PERSONA=marina python3 tests/e2e/run.py   # só uma

Cada teste faz login com email/senha (senhas fixadas via
/api/public/dev-test-session), visita as rotas principais para a persona e
tira screenshots em /tmp/browser/e2e/<persona>/.
"""

import asyncio
import json
import os
import sys
import urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from playwright.async_api import async_playwright, Page, BrowserContext

BASE = "http://localhost:8080"
PASSWORD = "TestPass!2026"
OUT = Path("/tmp/browser/e2e")
OUT.mkdir(parents=True, exist_ok=True)

PERSONAS = {
    "carlos":  {"user_id": "11111111-1111-1111-1111-111111111111", "role": "proprietario"},
    "marina":  {"user_id": "22222222-2222-2222-2222-222222222222", "role": "locatario"},
    "rafael":  {"user_id": "33333333-3333-3333-3333-333333333333", "role": "agente"},
}


def reset_password_and_get_email(user_id: str) -> str:
    """Reseta a senha da persona para PASSWORD e retorna o email."""
    req = urllib.request.Request(
        f"{BASE}/api/public/dev-test-session",
        data=json.dumps({"user_id": user_id, "password": PASSWORD}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        payload = json.loads(r.read().decode())
    if "email" not in payload:
        raise RuntimeError(f"Sem email na resposta: {payload}")
    return payload["email"]


async def do_login(page: Page, email: str) -> None:
    # Vai para /auth só para hidratar a app com a mesma origem/config
    await page.goto(f"{BASE}/auth", wait_until="domcontentloaded")
    # Espera o form aparecer (garante que o bundle carregou)
    await page.wait_for_selector("#login-email", timeout=15000)
    # Faz o login diretamente pela API do Supabase JS já disponível no bundle,
    # evitando corridas de hidratação no submit do form.
    result = await page.evaluate(
        """async ({ email, password }) => {
            const mod = await import('/src/integrations/supabase/client.ts');
            const { error, data } = await mod.supabase.auth.signInWithPassword({ email, password });
            return { error: error?.message ?? null, hasSession: !!data.session };
        }""",
        {"email": email, "password": PASSWORD},
    )
    if result.get("error") or not result.get("hasSession"):
        raise RuntimeError(f"login falhou: {result}")
    # Navega para dashboard para forçar o layout autenticado
    await page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")


async def snap(page: Page, folder: Path, name: str) -> None:
    await page.wait_for_timeout(600)
    await page.screenshot(path=str(folder / f"{name}.png"))
    print(f"  📸 {name}.png  ← {page.url}")


async def run_persona(ctx: BrowserContext, key: str) -> dict:
    persona = PERSONAS[key]
    folder = OUT / key
    folder.mkdir(parents=True, exist_ok=True)
    email = reset_password_and_get_email(persona["user_id"])
    print(f"\n=== {key.upper()} ({persona['role']}) — {email} ===")

    page = await ctx.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)

    try:
        await do_login(page, email)
        await snap(page, folder, "01_after_login")

        routes = [
            ("dashboard",     "/dashboard"),
            ("properties",    "/properties"),
            ("notifications", "/notifications"),
            ("chat",          "/chat"),
            ("contracts",     "/contracts"),
            ("financials",    "/financials"),
        ]
        # Rotas extras por persona
        if persona["role"] == "locatario":
            routes += [("favorites", "/favorites"), ("preapprovals", "/preapprovals")]
        if persona["role"] == "agente":
            routes += [("leads", "/leads"), ("public_profile", f"/agents/{persona['user_id']}")]
        if persona["role"] == "proprietario":
            routes += [("negotiations", "/negotiations"), ("affiliations", "/affiliations")]

        asserts: list[str] = []
        for i, (label, path) in enumerate(routes, start=2):
            try:
                await page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=15000)
                await snap(page, folder, f"{i:02d}_{label}")

                # ---- ASSERTS por persona ----
                if key == "rafael" and label == "leads":
                    # Rafael deve ver ≥1 card de lead (botão "Manifestar interesse")
                    await page.wait_for_selector("button:has-text('Manifestar interesse')", timeout=8000)
                    cards = await page.locator("button:has-text('Manifestar interesse')").count()
                    assert cards >= 1, f"Rafael esperava ≥1 lead, achou {cards}"
                    asserts.append(f"✅ /leads: {cards} card(s)")

                if key == "carlos" and label == "dashboard":
                    # Carlos deve ver a proposta pendente (R$ 3.300) e o texto "aguardando"
                    await page.wait_for_selector("text=aguardando", timeout=8000)
                    await page.wait_for_selector("text=3.300", timeout=4000)
                    asserts.append("✅ /dashboard: proposta pendente (R$ 3.300) visível")
            except AssertionError as e:
                print(f"  ❌ ASSERT {label}: {e}")
                errors.append(f"assert: {e}")
            except Exception as e:
                # Timeouts em asserts também contam como falha, não warning
                is_assert_route = (key == "rafael" and label == "leads") or (key == "carlos" and label == "dashboard")
                if is_assert_route:
                    print(f"  ❌ ASSERT {label}: {e}")
                    errors.append(f"assert: {e}")
                else:
                    print(f"  ⚠️  {label} ({path}): {e}")
        for a in asserts:
            print(f"  {a}")

        # Sempre um sanity check no body
        body_text = (await page.inner_text("body"))[:400]
        return {"persona": key, "email": email, "errors": errors[:10], "final_body": body_text}
    finally:
        await page.close()


async def main() -> None:
    only = os.environ.get("PERSONA")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        results = []
        for key in PERSONAS:
            if only and only != key:
                continue
            ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
            try:
                results.append(await run_persona(ctx, key))
            except Exception as e:
                print(f"❌ {key} falhou: {e}")
                results.append({"persona": key, "error": str(e)})
            finally:
                await ctx.close()
        await browser.close()

        # ---- Cenário integrado: Manifestar interesse ----
        scenario_error: str | None = None
        if not only or only in {"scenario", "manifestar"}:
            print("\n=== CENÁRIO: manifestar_interesse ===")
            try:
                from manifestar_interesse import main as manifestar_main  # type: ignore
                await manifestar_main()
                results.append({"scenario": "manifestar_interesse", "ok": True})
            except SystemExit as e:
                if e.code not in (0, None):
                    scenario_error = f"exit={e.code}"
            except Exception as e:
                scenario_error = str(e)
            if scenario_error:
                print(f"❌ manifestar_interesse falhou: {scenario_error}")
                results.append({"scenario": "manifestar_interesse", "error": scenario_error})

        print("\n\n===== RESUMO =====")
        for r in results:
            print(json.dumps(r, indent=2, ensure_ascii=False))
        # Falhar se qualquer persona teve exceção ou assert falhou
        failed = any("error" in r for r in results) or any(
            any(e.startswith("assert:") for e in r.get("errors", [])) for r in results
        )
        if failed:
            sys.exit(1)



if __name__ == "__main__":
    asyncio.run(main())
