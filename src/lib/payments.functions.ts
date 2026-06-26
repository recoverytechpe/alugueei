import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({ contractId: z.string().uuid() });

export type CheckoutResult =
  | { ok: true; initPoint: string; preferenceId: string; amount: number }
  | {
      ok: false;
      reason: "not_configured" | "not_authorized" | "contract_missing" | "no_rent_value" | "provider_error";
      message: string;
    };

/**
 * Cria uma preferência no Mercado Pago para caução + 1º aluguel.
 * Sem MERCADO_PAGO_ACCESS_TOKEN, retorna `not_configured` para a UI exibir
 * o estado "aguardando configuração" sem quebrar nada.
 */
export const createMpPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { supabase, userId } = context;

    const { data: contract, error } = await supabase
      .from("rental_contracts")
      .select("id, tenant_id, owner_id, rent_value, deposit_value, properties(title)")
      .eq("id", data.contractId)
      .maybeSingle();

    if (error || !contract) {
      return { ok: false, reason: "contract_missing", message: "Contrato não encontrado." };
    }
    if (contract.tenant_id !== userId) {
      return { ok: false, reason: "not_authorized", message: "Apenas o inquilino pode pagar." };
    }
    const rent = Number(contract.rent_value ?? 0);
    const deposit = Number(contract.deposit_value ?? rent);
    if (rent <= 0) {
      return { ok: false, reason: "no_rent_value", message: "Valor de aluguel não definido." };
    }
    const total = rent + deposit;

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) {
      return {
        ok: false,
        reason: "not_configured",
        message: "Pagamentos via Mercado Pago ainda não foram configurados.",
      };
    }

    const origin = process.env.PUBLIC_SITE_URL ?? "";
    const backUrl = (status: string) => `${origin}/contracts/${contract.id}?payment=${status}`;

    const body = {
      items: [
        {
          id: contract.id,
          title: `Caução + 1º aluguel — ${contract.properties?.title ?? "Imóvel"}`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: total,
        },
      ],
      external_reference: contract.id,
      back_urls: {
        success: backUrl("success"),
        failure: backUrl("failure"),
        pending: backUrl("pending"),
      },
      auto_return: "approved",
      notification_url: origin ? `${origin}/api/public/mp-webhook` : undefined,
      metadata: { contract_id: contract.id, payer_id: userId, kind: "deposit_plus_first_rent" },
    };

    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("[mp] preference error", await res.text());
      return { ok: false, reason: "provider_error", message: "Falha ao criar preferência." };
    }
    const json = (await res.json()) as { id: string; init_point: string };

    await supabase.from("payments").insert({
      contract_id: contract.id,
      payer_id: userId,
      provider: "mercadopago",
      preference_id: json.id,
      kind: "deposit_plus_first_rent",
      amount: total,
      status: "pending",
    });

    return { ok: true, initPoint: json.init_point, preferenceId: json.id, amount: total };
  });
