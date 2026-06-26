import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function UnreadChatBadge() {
  const qc = useQueryClient();
  const { data: unread = 0 } = useQuery({
    queryKey: ["chat-unread-count"],
    queryFn: async (): Promise<number> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return 0;
      const { data: msgs } = await supabase
        .from("messages")
        .select("sender_id")
        .is("read_at", null);
      return (msgs ?? []).filter((m) => m.sender_id !== u.user!.id).length;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("chat-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () =>
        qc.invalidateQueries({ queryKey: ["chat-unread-count"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return (
    <Button asChild variant="outline" className="relative">
      <Link to="/chat">
        Conversas
        {unread > 0 && (
          <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}
