import { supabase } from "@/integrations/supabase/client";

export async function getSignedAvatarUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
  if (error || !data) return null;
  return data.signedUrl;
}

export const ROLE_LABEL: Record<string, string> = {
  proprietario: "Proprietário",
  locatario: "Locatário",
  agente: "Agente de Localização",
};
