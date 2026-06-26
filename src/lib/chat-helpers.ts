import { supabase } from "@/integrations/supabase/client";

// Mask phone numbers (with 8+ digits) and emails in chat bodies
// until contacts are unlocked for the conversation.
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /(?:\+?\d[\s().-]?){8,}\d/g;

export function maskContacts(text: string): string {
  return text
    .replace(EMAIL_RE, "[contato oculto]")
    .replace(PHONE_RE, "[contato oculto]");
}

export async function getOrCreateConversation(params: {
  propertyId: string;
  otherUserId: string;
}): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sem sessão");
  const me = u.user.id;

  // Look for existing conversation between the two users for this property
  const { data: existing, error: selErr } = await supabase
    .from("conversations")
    .select("id")
    .eq("property_id", params.propertyId)
    .or(
      `and(initiator_id.eq.${me},recipient_id.eq.${params.otherUserId}),and(initiator_id.eq.${params.otherUserId},recipient_id.eq.${me})`
    )
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id;

  const { data: inserted, error: insErr } = await supabase
    .from("conversations")
    .insert({
      property_id: params.propertyId,
      initiator_id: me,
      recipient_id: params.otherUserId,
    })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return inserted.id;
}
