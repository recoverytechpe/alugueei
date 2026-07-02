import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Props = { targetUserId: string };

/**
 * Botão de bloquear/desbloquear usuário a partir do perfil público.
 * Reutiliza a tabela public.user_blocks — o trigger tg_block_messages_between_blocked
 * já impede o envio de mensagens entre bloqueados.
 */
export function BlockUserButton({ targetUserId }: Props) {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["user-block", targetUserId],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || u.user.id === targetUserId) return { me: null, blocked: false };
      const { data: row } = await supabase
        .from("user_blocks")
        .select("id")
        .eq("blocker_id", u.user.id)
        .eq("blocked_id", targetUserId)
        .maybeSingle();
      return { me: u.user.id, blocked: !!row };
    },
  });

  const toggle = useMutation({
    mutationFn: async () => {
      if (!data?.me) throw new Error("Faça login para bloquear.");
      if (data.blocked) {
        const { error } = await supabase
          .from("user_blocks")
          .delete()
          .eq("blocker_id", data.me)
          .eq("blocked_id", targetUserId);
        if (error) throw error;
        return "unblocked" as const;
      }
      const { error } = await supabase
        .from("user_blocks")
        .insert({ blocker_id: data.me, blocked_id: targetUserId });
      if (error) throw error;
      return "blocked" as const;
    },
    onSuccess: (result) => {
      toast.success(result === "blocked" ? "Usuário bloqueado." : "Usuário desbloqueado.");
      qc.invalidateQueries({ queryKey: ["user-block", targetUserId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data?.me) return null;

  return (
    <Button
      variant={data.blocked ? "outline" : "ghost"}
      size="sm"
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
      className="text-muted-foreground"
    >
      {data.blocked ? <ShieldOff className="size-4 mr-1.5" /> : <Ban className="size-4 mr-1.5" />}
      {data.blocked ? "Desbloquear" : "Bloquear"}
    </Button>
  );
}
