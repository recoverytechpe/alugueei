import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-side wrappers for SECURITY DEFINER RPCs that must not be callable
 * by anon/authenticated roles directly. Auth is enforced by the middleware
 * and the privileged call is made via the service-role admin client.
 */

// Loose UUID shape (any variant/version). Zod v4 `.uuid()` rejects non-RFC
// variant bits, which breaks fixture IDs like 1111...-1111 used in seeds/tests.
const uuidLoose = z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
const interestInput = z.object({
  propertyIds: z.array(uuidLoose).max(500),
});

export const getPropertyInterestCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => interestInput.parse(d))
  .handler(async ({ data }) => {
    if (data.propertyIds.length === 0) return [] as Array<{ property_id: string; interested_count: number }>;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("get_property_interest_counts", {
      _property_ids: data.propertyIds,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      property_id: r.property_id,
      interested_count: Number(r.interested_count) || 0,
    }));
  });

const markPaidInput = z.object({ contractId: z.string().uuid() });

export type MarkCommissionPaidResult =
  | { ok: true }
  | { ok: false; message: string };

export const markAgentCommissionPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => markPaidInput.parse(d))
  .handler(async ({ data, context }): Promise<MarkCommissionPaidResult> => {
    // The underlying RPC checks auth.uid() = owner_id. We re-check here via
    // the authenticated client (RLS applies) before invoking the admin path.
    const { data: contract, error } = await context.supabase
      .from("rental_contracts")
      .select("id, owner_id, agent_id")
      .eq("id", data.contractId)
      .maybeSingle();
    if (error || !contract) return { ok: false, message: "Contrato não encontrado." };
    if (contract.owner_id !== context.userId) return { ok: false, message: "Apenas o proprietário pode marcar." };
    if (!contract.agent_id) return { ok: false, message: "Contrato sem agente." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: rpcError } = await supabaseAdmin.rpc("mark_agent_commission_paid", {
      _contract_id: data.contractId,
    });
    if (rpcError) return { ok: false, message: rpcError.message };
    return { ok: true };
  });
