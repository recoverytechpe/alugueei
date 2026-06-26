import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook do Mercado Pago. Sem MERCADO_PAGO_ACCESS_TOKEN, responde 200
 * sem efeito colateral — permite cadastrar a URL no painel antes de finalizar.
 */
export const Route = createFileRoute("/api/public/mp-webhook")({
  server: {
    handlers: {
      GET: async () => new Response("ok", { status: 200 }),
      POST: async ({ request }) => {
        const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
        let body: unknown = null;
        try {
          body = await request.json();
        } catch {
          /* ignore */
        }

        if (!accessToken) {
          console.warn("[mp-webhook] received before token configured", body);
          return new Response("ok", { status: 200 });
        }

        const payload = body as { type?: string; action?: string; data?: { id?: string | number } } | null;
        const paymentId = payload?.data?.id;
        const type = payload?.type ?? payload?.action;
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
          const update: Record<string, string | null> = {
            payment_id: String(payment.id),
          };
          if (approved) {
            update.status = "paid";
            update.paid_at = new Date().toISOString();
            update.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          } else if (failed) {
            update.status = "failed";
          }
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
