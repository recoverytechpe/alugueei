# E2E — Fluxo de desbloqueio

## Setup local

```bash
bun add -d @playwright/test
bunx playwright install chromium
```

Adicione ao `.env.test` (ou exporte no shell):

```
E2E_BASE_URL=http://localhost:8080
E2E_TENANT_EMAIL=tenant.e2e@exemplo.com
E2E_TENANT_PASSWORD=********
E2E_PROPERTY_ID=<uuid de um imóvel publicado>
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role — apenas local>
```

> O `SUPABASE_SERVICE_ROLE_KEY` é usado **apenas em ambiente local** para
> simular o webhook do Mercado Pago (inserir `property_unlocks` com
> `status='paid'`) e para forçar expiração. Nunca exponha em CI público.

## Rodar

```bash
bun run dev   # em outro terminal
bunx playwright test
```

## Cenários cobertos

1. **Bloqueado** — endereço aproximado + CTA "Desbloquear imóvel".
2. **Termos + LGPD** — botão confirmar só habilita com ambos aceitos.
3. **Paid (mock)** — após webhook simulado, badge "Desbloqueado" aparece.
4. **Acesso liberado** — sem CTA de desbloqueio, contagem regressiva visível.
5. **Expirado** — banner âmbar + botão "Renovar acesso · R$ 29,90".
