import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UNLOCK_PRICE = 29.9;

const schema = z.object({
  propertyId: z.string().uuid(),
  termsAccepted: z.boolean(),
  lgpdAccepted: z.boolean(),
});

export type UnlockCheckoutResult =
  | { ok: true; initPoint: string; preferenceId: string }
  | {
      ok: false;
      reason: "not_configured" | "validation" | "already_paid" | "provider_error";
      message: string;
    };

/**
 * Cria preferência no Mercado Pago para desbloqueio de imóvel (R$ 29,90).
 * Sem MERCADO_PAGO_ACCESS_TOKEN, retorna `not_configured`.
 */
export const createUnlockCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }): Promise<UnlockCheckoutResult> => {
    const { supabase, userId } = context;

    if (!data.termsAccepted || !data.lgpdAccepted) {
      return { ok: false, reason: "validation", message: "Aceite os termos e a LGPD." };
    }

    const { data: property } = await supabase
      .from("properties")
      .select("id, title")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (!property) {
      return { ok: false, reason: "validation", message: "Imóvel não encontrado." };
    }

    const { data: existing } = await supabase
      .from("property_unlocks")
      .select("id, status, expires_at")
      .eq("user_id", userId)
      .eq("property_id", data.propertyId)
      .maybeSingle();

    if (existing && existing.status === "paid" && (!existing.expires_at || new Date(existing.expires_at) > new Date())) {
      return { ok: false, reason: "already_paid", message: "Imóvel já desbloqueado." };
    }

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) {
      return {
        ok: false,
        reason: "not_configured",
        message: "Mercado Pago ainda não foi configurado.",
      };
    }

    const now = new Date().toISOString();
    let unlockId = existing?.id ?? null;
    if (!unlockId) {
      const { data: inserted, error } = await supabase
        .from("property_unlocks")
        .insert({
          user_id: userId,
          property_id: data.propertyId,
          status: "pending",
          amount_cents: Math.round(UNLOCK_PRICE * 100),
          terms_accepted_at: now,
          lgpd_accepted_at: now,
        })
        .select("id")
        .single();
      if (error || !inserted) {
        return { ok: false, reason: "provider_error", message: error?.message ?? "Erro ao registrar." };
      }
      unlockId = inserted.id;
    } else {
      await supabase
        .from("property_unlocks")
        .update({
          status: "pending",
          terms_accepted_at: now,
          lgpd_accepted_at: now,
        })
        .eq("id", unlockId);
    }

    const origin = process.env.PUBLIC_SITE_URL ?? "";
    const backUrl = (status: string) =>
      origin ? `${origin}/properties/${data.propertyId}?unlock=${status}` : undefined;

    const body = {
      items: [
        {
          id: `unlock_${unlockId}`,
          title: `Desbloqueio · ${property.title}`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: UNLOCK_PRICE,
        },
      ],
      external_reference: `unlock:${unlockId}`,
      back_urls: origin
        ? {
            success: backUrl("success"),
            failure: backUrl("failure"),
            pending: backUrl("pending"),
          }
        : undefined,
      auto_return: origin ? "approved" : undefined,
      notification_url: origin ? `${origin}/api/public/mp-webhook` : undefined,
      metadata: { unlock_id: unlockId, user_id: userId, kind: "property_unlock" },
    };

    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("[mp-unlock] preference error", await res.text());
      return { ok: false, reason: "provider_error", message: "Falha ao criar preferência." };
    }
    const json = (await res.json()) as { id: string; init_point: string };

    await supabase
      .from("property_unlocks")
      .update({ payment_id: json.id })
      .eq("id", unlockId);

    return { ok: true, initPoint: json.init_point, preferenceId: json.id };
  });
