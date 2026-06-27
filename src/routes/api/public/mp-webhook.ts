import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Webhook do Mercado Pago. Valida x-signature (HMAC SHA-256) com
 * MERCADO_PAGO_WEBHOOK_SECRET antes de processar.
 * Sem MERCADO_PAGO_ACCESS_TOKEN, responde 200 sem efeito colateral.
 */
export const Route = createFileRoute("/api/public/mp-webhook")({
  server: {
    handlers: {
      GET: async () => new Response("ok", { status: 200 }),
      POST: async ({ request }) => {
        const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
        const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

        const rawBody = await request.text();
        let body: unknown = null;
        try {
          body = JSON.parse(rawBody);
        } catch {
          /* ignore */
        }

        const payload = body as { type?: string; action?: string; data?: { id?: string | number } } | null;
        const paymentId = payload?.data?.id;
        const type = payload?.type ?? payload?.action;

        // === Validação de assinatura (x-signature) — OBRIGATÓRIA ===
        // Formato MP: "ts=1700000000,v1=hexhash"
        // Manifest:  id:<data.id>;request-id:<x-request-id>;ts:<ts>;
        if (!webhookSecret) {
          console.error("[mp-webhook] MERCADO_PAGO_WEBHOOK_SECRET not configured — rejecting request");
          return new Response("Server misconfigured", { status: 500 });
        }
        const sigHeader = request.headers.get("x-signature") ?? "";
        const requestId = request.headers.get("x-request-id") ?? "";
        const parts = Object.fromEntries(
          sigHeader.split(",").map((p) => {
            const [k, ...v] = p.trim().split("=");
            return [k, v.join("=")];
          }),
        );
        const ts = parts.ts;
        const v1 = parts.v1;
        if (!ts || !v1 || !paymentId) {
          console.warn("[mp-webhook] missing signature parts");
          return new Response("unauthorized", { status: 401 });
        }
        const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
        const expected = createHmac("sha256", webhookSecret).update(manifest).digest("hex");
        const a = Buffer.from(v1, "hex");
        const b = Buffer.from(expected, "hex");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          console.warn("[mp-webhook] invalid signature");
          return new Response("unauthorized", { status: 401 });
        }

        if (!accessToken) {
          console.warn("[mp-webhook] received before token configured", body);
          return new Response("ok", { status: 200 });
        }

        if (!paymentId || (type && !String(type).includes("payment"))) {
          return new Response("ignored", { status: 200 });
        }


        const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          console.error("[mp-webhook] fetch payment failed", await res.text());
          return new Response("err", { status: 200 });
        }
        const payment = (await res.json()) as {
          id: number;
          status: string;
          external_reference?: string;
        };

        const externalRef = payment.external_reference;
        if (!externalRef) return new Response("ok", { status: 200 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // === Desbloqueio de imóvel (R$ 29,90) ===
        if (externalRef.startsWith("unlock:")) {
          const unlockId = externalRef.slice("unlock:".length);
          const approved = payment.status === "approved";
          const failed = ["rejected", "cancelled"].includes(payment.status);
          const update = {
            payment_id: String(payment.id),
            ...(approved
              ? {
                  status: "paid",
                  paid_at: new Date().toISOString(),
                  expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                }
              : failed
                ? { status: "failed" }
                : {}),
          };
          await supabaseAdmin.from("property_unlocks").update(update).eq("id", unlockId);
          return new Response("ok", { status: 200 });
        }

        // === Pagamento de contrato (caução + 1º aluguel) ===
        const contractId = externalRef;
        await supabaseAdmin
          .from("payments")
          .update({
            provider_payment_id: String(payment.id),
            status: payment.status,
            raw: payment as unknown as never,
          })
          .eq("contract_id", contractId);

        const nextStatus =
          payment.status === "approved"
            ? "paid"
            : ["rejected", "cancelled"].includes(payment.status)
              ? "failed"
              : "processing";

        await supabaseAdmin
          .from("rental_contracts")
          .update({
            payment_status: nextStatus,
            ...(nextStatus === "paid"
              ? { payment_id: String(payment.id), paid_at: new Date().toISOString() }
              : {}),
          })
          .eq("id", contractId);

        return new Response("ok", { status: 200 });
      },
    },
  },
});
